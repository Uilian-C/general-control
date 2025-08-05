import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore';
import { Target, Flag, Plus, Trash2, X, Layers, Briefcase, Edit, Settings } from 'lucide-react';

// --- Configuração do Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyCESjyYypWPaerOk9jGE2uvcjZlsuH_YrI",
  authDomain: "general-control-fb57b.firebaseapp.com",
  projectId: "general-control-fb57b",
  storageBucket: "general-control-fb57b.appspot.com",
  messagingSenderId: "939076716946",
  appId: "1:939076716946:web:176240d8cb942b12df194b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Constantes e Helpers ---
const PRIORITIES = {
  'Alta': { label: 'Alta', color: 'bg-red-400' },
  'Média': { label: 'Média', color: 'bg-yellow-400' },
  'Baixa': { label: 'Baixa', color: 'bg-blue-400' },
};

const STATUSES = {
  'A Fazer': { label: 'A Fazer', color: 'bg-gray-200 text-gray-800' },
  'Em Progresso': { label: 'Em Progresso', color: 'bg-indigo-200 text-indigo-800' },
  'Concluído': { label: 'Concluído', color: 'bg-green-200 text-green-800' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
};

const getDaysInView = (startDate, endDate) => {
    const days = [];
    let current = new Date(startDate);
    current.setUTCHours(0,0,0,0);
    const end = new Date(endDate);
    end.setUTCHours(0,0,0,0);

    while (current <= end) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    return days;
};

// --- Componentes da UI ---
const Card = ({ children, className = '' }) => (
    <div className={`bg-white border border-gray-200 rounded-xl p-6 shadow-sm ${className}`}>
        {children}
    </div>
);

const Button = ({ onClick, children, className = '', variant = 'primary' }) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2';
    const variantClasses = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    };
    return (
        <button onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
            {children}
        </button>
    );
};

const Modal = ({ isOpen, onClose, title, children, size = '2xl' }) => {
    if (!isOpen) return null;
    const sizeClasses = {
        '2xl': 'max-w-2xl',
        '4xl': 'max-w-4xl',
    }
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className={`bg-white rounded-xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col`}>
                <header className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </header>
                <main className="p-6 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
};

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <header className="p-4">
                    <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                </header>
                <main className="p-4 text-gray-600">
                    {children}
                </main>
                <footer className="flex justify-end space-x-4 p-4 bg-gray-50 rounded-b-xl">
                    <Button onClick={onClose} variant="secondary">Cancelar</Button>
                    <Button onClick={onConfirm} variant="danger">Confirmar</Button>
                </footer>
            </div>
        </div>
    );
};

const OkrManagementModal = ({ isOpen, onClose, okrs, onSave, onDelete }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedOkr, setSelectedOkr] = useState(null);

    const handleAddNew = () => {
        setSelectedOkr(null);
        setIsFormOpen(true);
    };

    const handleEdit = (okr) => {
        setSelectedOkr(okr);
        setIsFormOpen(true);
    };

    const handleSave = (okrData) => {
        onSave(okrData);
        setIsFormOpen(false);
        setSelectedOkr(null);
    };

    const OkrForm = ({ okr, onSave, onCancel }) => {
        const [objective, setObjective] = useState(okr?.objective || '');
        const [keyResults, setKeyResults] = useState(okr?.keyResults || [{ text: '' }]);

        const handleKrChange = (index, value) => {
            const newKrs = [...keyResults];
            newKrs[index].text = value;
            setKeyResults(newKrs);
        };

        const addKr = () => setKeyResults([...keyResults, { text: '' }]);
        const removeKr = (index) => setKeyResults(keyResults.filter((_, i) => i !== index));

        const handleFormSave = () => {
            if (!objective.trim()) return;
            const finalKrs = keyResults.filter(kr => kr.text.trim() !== '');
            onSave({ id: okr?.id, objective, keyResults: finalKrs });
        };

        return (
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mt-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">{okr ? 'Editar OKR' : 'Novo OKR'}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Objetivo</label>
                        <input type="text" value={objective} onChange={e => setObjective(e.target.value)} placeholder="Ex: Lançar o melhor produto do mercado" className="w-full p-2 bg-white border border-gray-300 rounded-md text-gray-800" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Resultados-Chave</label>
                        <div className="space-y-2">
                            {keyResults.map((kr, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                    <input type="text" value={kr.text} onChange={e => handleKrChange(index, e.target.value)} placeholder={`KR ${index + 1}`} className="flex-grow p-2 bg-white border border-gray-300 rounded-md text-gray-800" />
                                    <button onClick={() => removeKr(index)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16} /></button>
                                </div>
                            ))}
                        </div>
                        <Button onClick={addKr} variant="secondary" className="mt-2 text-sm"><Plus size={16}/> Adicionar KR</Button>
                    </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                    <Button onClick={onCancel} variant="secondary">Cancelar</Button>
                    <Button onClick={handleFormSave} variant="primary">Salvar OKR</Button>
                </div>
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gerenciar OKRs" size="4xl">
            <div className="space-y-4">
                <div className="flex justify-end">
                    <Button onClick={handleAddNew} variant="primary">
                        <Plus size={16} /> Novo OKR
                    </Button>
                </div>
                {isFormOpen && <OkrForm okr={selectedOkr} onSave={handleSave} onCancel={() => setIsFormOpen(false)} />}
                
                <div className="mt-6 space-y-3">
                    {okrs.map(okr => (
                        <div key={okr.id} className="p-4 border border-gray-200 rounded-lg flex justify-between items-start">
                           <div>
                                <h4 className="font-bold text-gray-800">{okr.objective}</h4>
                                <ul className="list-disc list-inside mt-2 text-gray-600 space-y-1">
                                    {okr.keyResults?.map((kr, i) => <li key={i}>{kr.text}</li>)}
                                </ul>
                           </div>
                           <div className="flex space-x-2 flex-shrink-0 ml-4">
                                <Button onClick={() => handleEdit(okr)} variant="secondary" className="!p-2"><Edit size={16}/></Button>
                                <Button onClick={() => onDelete(okr.id)} variant="danger" className="!p-2"><Trash2 size={16}/></Button>
                           </div>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

const TaskModal = ({ isOpen, onClose, task, tasks, okrs, onSave, onDeleteRequest }) => {
    const [currentTask, setCurrentTask] = useState({});

    useEffect(() => {
        if (task) {
            setCurrentTask({ ...task, dependencies: task.dependencies || [], subtasks: task.subtasks || [] });
        } else {
            const today = new Date().toISOString().split('T')[0];
            setCurrentTask({
                title: '',
                description: '',
                priority: 'Média',
                status: 'A Fazer',
                startDate: today,
                endDate: today,
                isMilestone: false,
                okrId: '',
                dependencies: [],
                subtasks: []
            });
        }
    }, [task, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setCurrentTask(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const addSubtask = () => {
        setCurrentTask(prev => ({ ...prev, subtasks: [...(prev.subtasks || []), { id: `sub_${Date.now()}`, text: '', completed: false }] }));
    };

    const removeSubtask = (index) => {
        const newSubtasks = currentTask.subtasks.filter((_, i) => i !== index);
        setCurrentTask(prev => ({ ...prev, subtasks: newSubtasks }));
    };

    const handleSave = () => {
        onSave(currentTask);
        onClose();
    };
    
    const handleDelete = () => {
        onDeleteRequest(task.id);
    };

    if (!isOpen) return null;

    const availableDependencies = tasks.filter(t => t.id !== (task ? task.id : null));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={task ? "Editar Tarefa" : "Nova Tarefa"}>
            <div className="space-y-4 text-gray-700">
                <input type="text" name="title" value={currentTask.title || ''} onChange={handleChange} placeholder="Título da Tarefa" className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800" />
                <textarea name="description" value={currentTask.description || ''} onChange={handleChange} placeholder="Descrição" className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800 h-24"></textarea>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-500">Prioridade</label>
                        <select name="priority" value={currentTask.priority || 'Média'} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800">
                            {Object.keys(PRIORITIES).map(p => <option key={p} value={p}>{PRIORITIES[p].label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500">Status</label>
                        <select name="status" value={currentTask.status || 'A Fazer'} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800">
                            {Object.keys(STATUSES).map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500">Data de Início</label>
                        <input type="date" name="startDate" value={currentTask.startDate || ''} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500">Data de Fim</label>
                        <input type="date" name="endDate" value={currentTask.endDate || ''} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500">Vincular ao OKR</label>
                    <select name="okrId" value={currentTask.okrId || ''} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800">
                        <option value="">Nenhum</option>
                        {okrs.map(okr => <option key={okr.id} value={okr.id}>{okr.objective}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500">Dependências</label>
                    <select
                        multiple
                        name="dependencies"
                        value={currentTask.dependencies || []}
                        onChange={(e) => setCurrentTask(prev => ({ ...prev, dependencies: Array.from(e.target.selectedOptions, option => option.value) }))}
                        className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800 h-32"
                    >
                        {availableDependencies.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Segure Ctrl/Cmd para selecionar múltiplos.</p>
                </div>

                <div className="flex items-center space-x-2 mt-4">
                    <input type="checkbox" id="isMilestone" name="isMilestone" checked={currentTask.isMilestone || false} onChange={handleChange} className="form-checkbox h-5 w-5 bg-gray-200 border-gray-300 rounded text-indigo-600 focus:ring-indigo-500" />
                    <label htmlFor="isMilestone" className="text-gray-700">Marcar como um Marco (Milestone)</label>
                </div>

                <footer className="flex justify-between items-center space-x-4 pt-4 border-t border-gray-200 mt-4">
                    <div>
                        {task && <Button onClick={handleDelete} variant="danger"><Trash2 size={16}/> Excluir</Button>}
                    </div>
                    <div className="flex items-center space-x-4">
                        <Button onClick={onClose} variant="secondary">Cancelar</Button>
                        <Button onClick={handleSave} variant="primary">Salvar</Button>
                    </div>
                </footer>
            </div>
        </Modal>
    );
};

const Timeline = ({ tasks, onTaskClick, timeScale, dependencyLines }) => {
    const today = new Date();
    today.setUTCHours(0,0,0,0);

    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        let start = new Date(now);
        let end = new Date(now);

        switch (timeScale) {
            case 'Semanal':
                start.setDate(now.getDate() - now.getDay());
                end.setDate(start.getDate() + 6);
                break;
            case 'Mensal':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
                break;
            case 'Trimestral':
                const quarter = Math.floor(now.getMonth() / 3);
                start = new Date(now.getFullYear(), quarter * 3, 1);
                end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
                break;
            case 'Anual':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31);
                break;
            default:
                start.setDate(now.getDate() - now.getDay());
                end.setDate(start.getDate() + 6);
                break;
        }
        return { startDate: start, endDate: end };
    }, [timeScale]);

    const days = useMemo(() => getDaysInView(startDate, endDate), [startDate, endDate]);
    const dayWidth = 45;
    const timelineWidth = days.length * dayWidth;

    const getMonthLabel = (date) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
    const months = useMemo(() => {
        const monthMap = new Map();
        days.forEach(day => {
            const monthKey = `${day.getFullYear()}-${day.getMonth()}`;
            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, { label: getMonthLabel(day), days: 0 });
            }
            monthMap.get(monthKey).days += 1;
        });
        return Array.from(monthMap.values());
    }, [days]);

    return (
        <div className="relative overflow-x-auto bg-white border border-gray-200 rounded-lg pb-4 shadow-sm">
             <div style={{ width: timelineWidth }}>
                <div className="flex sticky top-0 z-20 bg-gray-100 bg-opacity-80 backdrop-blur-sm">
                    {months.map((month, index) => (
                        <div key={index} className="text-center font-semibold text-gray-700 border-b-2 border-r border-gray-200 py-2" style={{ width: month.days * dayWidth }}>
                            {month.label}
                        </div>
                    ))}
                </div>
                <div className="flex sticky top-11 z-20 bg-gray-100 bg-opacity-80 backdrop-blur-sm">
                    {days.map((day, index) => (
                        <div key={index} className="flex-shrink-0 text-center border-b border-r border-gray-200" style={{ width: dayWidth }}>
                            <div className={`text-xs ${day.toDateString() === today.toDateString() ? 'text-indigo-600' : 'text-gray-500'}`}>
                                {new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day).slice(0,3)}
                            </div>
                            <div className={`text-lg font-semibold ${day.toDateString() === today.toDateString() ? 'text-indigo-600' : 'text-gray-800'}`}>
                                {day.getDate()}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="absolute top-0 left-0 w-full h-full z-0">
                    <div className="flex h-full" style={{ width: timelineWidth }}>
                        {days.map((day, index) => (
                            <div key={index} className={`flex-shrink-0 h-full border-r border-gray-100 ${day.toDateString() === today.toDateString() ? 'bg-indigo-100' : ''}`} style={{ width: dayWidth }}></div>
                        ))}
                    </div>
                </div>
                <div className="relative pt-4 space-y-2 z-10" style={{ height: tasks.length * 48 }}>
                    {tasks.map((task, index) => {
                        const taskStart = new Date(task.startDate);
                        taskStart.setUTCHours(0,0,0,0);
                        const taskEnd = new Date(task.endDate);
                        taskEnd.setUTCHours(0,0,0,0);

                        const startOffset = Math.max(0, (taskStart - startDate) / (1000 * 60 * 60 * 24));
                        const duration = Math.max(1, (taskEnd - taskStart) / (1000 * 60 * 60 * 24) + 1);
                        
                        const left = startOffset * dayWidth;
                        const width = duration * dayWidth - 4;

                        if (taskEnd < startDate || taskStart > endDate) return null;

                        const priorityClasses = PRIORITIES[task.priority] || PRIORITIES['Média'];
                        
                        const subtaskProgress = task.subtasks && task.subtasks.length > 0
                            ? (task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100
                            : (task.status === 'Concluído' ? 100 : 0);

                        return (
                            <div
                                key={task.id}
                                id={`task-${task.id}`}
                                className="h-10 absolute flex items-center rounded-lg cursor-pointer hover:scale-105 hover:z-20 transition-transform duration-200"
                                style={{ top: `${index * 48}px`, left: `${left}px`, width: `${width}px` }}
                                onClick={() => onTaskClick(task)}
                            >
                                <div className={`h-full w-full ${priorityClasses.color} rounded-lg flex items-center px-3 overflow-hidden relative shadow-md border-2 border-transparent hover:border-indigo-500`}>
                                    <div className="absolute top-0 left-0 h-full bg-black bg-opacity-10 rounded-lg" style={{ width: `${subtaskProgress}%` }}></div>
                                    {task.isMilestone && <Flag className="text-white mr-2 flex-shrink-0 z-10" size={16} />}
                                    <p className="text-sm font-semibold text-white truncate z-10">{task.title}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <svg className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none" style={{ height: tasks.length * 48 + 50 }}>
                   {dependencyLines.map((line, i) => (
                       <path
                           key={i}
                           d={line.d}
                           stroke="#6366f1"
                           strokeWidth="2"
                           fill="none"
                           markerEnd="url(#arrowhead)"
                       />
                   ))}
                   <defs>
                       <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                           <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
                       </marker>
                   </defs>
                </svg>
            </div>
        </div>
    );
};

const FilterGroup = ({ title, options, active, onFilterChange }) => (
    <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-600">{title}:</span>
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-1">
            <button
                onClick={() => onFilterChange('Todos')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${active === 'Todos' ? 'bg-white shadow-sm text-indigo-600 font-semibold' : 'text-gray-600 hover:bg-gray-200'}`}
            >
                Todos
            </button>
            {Object.keys(options).map(key => (
                <button
                    key={key}
                    onClick={() => onFilterChange(key)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${active === key ? 'bg-white shadow-sm text-indigo-600 font-semibold' : 'text-gray-600 hover:bg-gray-200'}`}
                >
                    {options[key].label}
                </button>
            ))}
        </div>
    </div>
);

const WorkspaceView = ({ tasks, onTaskClick, filters, setFilters, timeScale, setTimeScale, dependencyLines }) => {
    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <FilterGroup title="Prioridade" options={PRIORITIES} active={filters.priority} onFilterChange={val => setFilters({...filters, priority: val})}/>
                        <FilterGroup title="Status" options={STATUSES} active={filters.status} onFilterChange={val => setFilters({...filters, status: val})}/>
                    </div>
                    <select value={timeScale} onChange={e => setTimeScale(e.target.value)} className="bg-gray-100 border-gray-300 text-gray-800 rounded-md p-2">
                        <option>Semanal</option>
                        <option>Mensal</option>
                        <option>Trimestral</option>
                        <option>Anual</option>
                    </select>
                </div>
            </Card>
            <Timeline tasks={tasks} onTaskClick={onTaskClick} timeScale={timeScale} dependencyLines={dependencyLines} />
        </div>
    );
};

const ExecutiveView = ({ tasks, okrs }) => {
    const okrProgress = useMemo(() => {
        return okrs.map(okr => {
            const relatedTasks = tasks.filter(t => t.okrId === okr.id);
            if (relatedTasks.length === 0) {
                return { ...okr, progress: 0, taskCount: 0 };
            }
            const completedTasks = relatedTasks.filter(t => t.status === 'Concluído');
            const progress = (completedTasks.length / relatedTasks.length) * 100;
            return { ...okr, progress: Math.round(progress), taskCount: relatedTasks.length };
        });
    }, [tasks, okrs]);

    const milestones = useMemo(() => {
        return tasks
            .filter(t => t.isMilestone)
            .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    }, [tasks]);

    return (
        <div className="space-y-8">
            <Card>
                <h2 className="text-3xl font-bold text-gray-800 mb-4 flex items-center"><Briefcase className="mr-3 text-indigo-600" />Visão Executiva</h2>
                <p className="text-gray-600">Um resumo de alto nível do progresso em relação aos objetivos e marcos principais.</p>
            </Card>
            <Card>
                <h3 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center"><Target className="mr-3 text-indigo-600" />Progresso dos OKRs</h3>
                <div className="space-y-6">
                    {okrProgress.length > 0 ? okrProgress.map(okr => (
                        <div key={okr.id}>
                            <div className="flex justify-between items-baseline mb-1">
                                <span className="font-semibold text-gray-700">{okr.objective}</span>
                                <span className="text-sm font-bold text-indigo-600">{okr.progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-4">
                                <div className="bg-indigo-600 h-4 rounded-full transition-all duration-500" style={{ width: `${okr.progress}%` }}></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{okr.taskCount} tarefas associadas.</p>
                        </div>
                    )) : <p className="text-gray-500">Nenhum OKR definido ou vinculado a tarefas.</p>}
                </div>
            </Card>
            <Card>
                 <h3 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center"><Flag className="mr-3 text-yellow-500" />Marcos (Milestones)</h3>
                 <div className="space-y-4">
                    {milestones.length > 0 ? milestones.map(milestone => (
                        <div key={milestone.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div>
                                <p className="font-semibold text-gray-700">{milestone.title}</p>
                                <p className="text-sm text-gray-500">{milestone.description}</p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-4">
                                <p className={`text-sm font-bold px-3 py-1 rounded-full ${STATUSES[milestone.status]?.color || 'bg-gray-200 text-gray-800'}`}>{milestone.status}</p>
                                <p className="text-xs text-gray-500 mt-1">{formatDate(milestone.startDate)} - {formatDate(milestone.endDate)}</p>
                            </div>
                        </div>
                    )) : <p className="text-gray-500">Nenhum marco definido no roadmap.</p>}
                 </div>
            </Card>
        </div>
    );
};


export default function App() {
    const [view, setView] = useState('workspace');
    const [tasks, setTasks] = useState([]);
    const [okrs, setOkrs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isOkrModalOpen, setIsOkrModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [filters, setFilters] = useState({ priority: 'Todos', status: 'Todos' });
    const [timeScale, setTimeScale] = useState('Mensal');
    const [userId, setUserId] = useState(null);
    const [appId, setAppId] = useState('default-app-id');
    const [dependencyLines, setDependencyLines] = useState([]);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    useEffect(() => {
        const currentAppId = 'general-control'; // Hardcoded for GitHub Pages
        setAppId(currentAppId);
        
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                signInAnonymously(auth).catch((error) => console.error("Error signing in anonymously:", error));
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!userId || !appId) return;

        setIsLoading(true);
        const tasksCollectionPath = `artifacts/${appId}/public/data/roadmap_tasks`;
        const okrsCollectionPath = `artifacts/${appId}/public/data/okrs`;

        const unsubscribeTasks = onSnapshot(query(collection(db, tasksCollectionPath)), (snapshot) => {
            setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoading(false);
        }, (error) => console.error("Error fetching tasks:", error));

        const unsubscribeOkrs = onSnapshot(query(collection(db, okrsCollectionPath)), (snapshot) => {
            setOkrs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Error fetching OKRs:", error));

        return () => {
            unsubscribeTasks();
            unsubscribeOkrs();
        };
    }, [userId, appId]);

    const handleSaveTask = async (taskData) => {
        const collectionPath = `artifacts/${appId}/public/data/roadmap_tasks`;
        if (taskData.id) {
            const { id, ...dataToUpdate } = taskData;
            await updateDoc(doc(db, collectionPath, id), dataToUpdate);
        } else {
            await addDoc(collection(db, collectionPath), taskData);
        }
    };
    
    const handleSaveOkr = async (okrData) => {
        const collectionPath = `artifacts/${appId}/public/data/okrs`;
        if (okrData.id) {
            const { id, ...dataToUpdate } = okrData;
            await updateDoc(doc(db, collectionPath, id), dataToUpdate);
        } else {
            await addDoc(collection(db, collectionPath), okrData);
        }
    };

    const requestDelete = (id, type) => {
        setItemToDelete({ id, type });
        setIsConfirmDeleteOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        const { id, type } = itemToDelete;
        const collectionPath = `artifacts/${appId}/public/data/${type === 'task' ? 'roadmap_tasks' : 'okrs'}`;
        await deleteDoc(doc(db, collectionPath, id));
        
        if (type === 'task') setIsTaskModalOpen(false);
        
        setIsConfirmDeleteOpen(false);
        setItemToDelete(null);
    };

    const handleOpenTaskModal = (task = null) => {
        setSelectedTask(task);
        setIsTaskModalOpen(true);
    };

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const priorityMatch = filters.priority === 'Todos' || task.priority === filters.priority;
            const statusMatch = filters.status === 'Todos' || task.status === filters.status;
            return priorityMatch && statusMatch;
        });
    }, [tasks, filters]);
    
    const calculateDependencyLines = useCallback(() => {
        if (!filteredTasks.length) {
            setDependencyLines([]);
            return;
        }
        const lines = [];
        const containerElem = document.querySelector('.relative.overflow-x-auto');
        if (!containerElem) return;
        const containerRect = containerElem.getBoundingClientRect();
        filteredTasks.forEach((task) => {
            if (task.dependencies && task.dependencies.length > 0) {
                task.dependencies.forEach(depId => {
                    const startElem = document.getElementById(`task-${depId}`);
                    const endElem = document.getElementById(`task-${task.id}`);
                    if (startElem && endElem) {
                        const startRect = startElem.getBoundingClientRect();
                        const endRect = endElem.getBoundingClientRect();
                        const startX = startRect.left - containerRect.left + startRect.width + containerElem.scrollLeft;
                        const startY = startRect.top - containerRect.top + startRect.height / 2;
                        const endX = endRect.left - containerRect.left + containerElem.scrollLeft;
                        const endY = endRect.top - containerRect.top + endRect.height / 2;
                        const controlX1 = startX + 60;
                        const controlY1 = startY;
                        const controlX2 = endX - 60;
                        const controlY2 = endY;
                        lines.push({ d: `M ${startX} ${startY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${endX} ${endY}` });
                    }
                });
            }
        });
        setDependencyLines(lines);
    }, [filteredTasks]);

    useEffect(() => {
        const timer = setTimeout(calculateDependencyLines, 500);
        const containerElem = document.querySelector('.relative.overflow-x-auto');
        containerElem?.addEventListener('scroll', calculateDependencyLines);
        return () => {
            clearTimeout(timer);
            containerElem?.removeEventListener('scroll', calculateDependencyLines);
        };
    }, [filteredTasks, timeScale, calculateDependencyLines]);

    if (isLoading && !tasks.length) {
        return <div className="bg-gray-50 text-gray-800 min-h-screen flex items-center justify-center">Carregando Roadmap...</div>;
    }

    return (
        <div className="bg-gray-50 text-gray-800 min-h-screen p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-600">Roadmap Ágil Interativo</h1>
                            <p className="text-gray-600 mt-1">Planeje, execute e apresente com clareza e foco.</p>
                        </div>
                        <div className="flex items-center bg-gray-200 rounded-lg p-1 space-x-1">
                            <Button onClick={() => setView('workspace')} variant={view === 'workspace' ? 'primary' : 'secondary'} className="!shadow-none"><Layers size={16}/> Workspace</Button>
                            <Button onClick={() => setView('executive')} variant={view === 'executive' ? 'primary' : 'secondary'} className="!shadow-none"><Briefcase size={16}/> Executive</Button>
                        </div>
                    </div>
                </header>

                <main>
                    {view === 'workspace' && (
                        <>
                            <WorkspaceView
                                tasks={filteredTasks}
                                onTaskClick={handleOpenTaskModal}
                                filters={filters}
                                setFilters={setFilters}
                                timeScale={timeScale}
                                setTimeScale={setTimeScale}
                                dependencyLines={dependencyLines}
                            />
                             <div className="mt-6 flex justify-end gap-4">
                                <Button onClick={() => setIsOkrModalOpen(true)} variant="secondary">
                                    <Settings size={20} className="mr-2"/> Gerenciar OKRs
                                </Button>
                                <Button onClick={() => handleOpenTaskModal()} variant="primary">
                                    <Plus size={20} className="mr-2"/> Nova Tarefa
                                </Button>
                            </div>
                        </>
                    )}
                    {view === 'executive' && <ExecutiveView tasks={tasks} okrs={okrs} />}
                </main>

                <TaskModal
                    isOpen={isTaskModalOpen}
                    onClose={() => setIsTaskModalOpen(false)}
                    task={selectedTask}
                    tasks={tasks}
                    okrs={okrs}
                    onSave={handleSaveTask}
                    onDeleteRequest={(id) => requestDelete(id, 'task')}
                />
                <OkrManagementModal
                    isOpen={isOkrModalOpen}
                    onClose={() => setIsOkrModalOpen(false)}
                    okrs={okrs}
                    onSave={handleSaveOkr}
                    onDelete={(id) => requestDelete(id, 'okr')}
                />
                <ConfirmModal
                    isOpen={isConfirmDeleteOpen}
                    onClose={() => setIsConfirmDeleteOpen(false)}
                    onConfirm={confirmDelete}
                    title="Confirmar Exclusão"
                >
                    <p>Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.</p>
                </ConfirmModal>
            </div>
        </div>
    );
}
