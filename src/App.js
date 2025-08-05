import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, serverTimestamp } from 'firebase/firestore';
import { Target, Flag, Plus, Trash2, X, Layers, Briefcase, Edit, Settings, ChevronLeft, ChevronRight, Tag, Palette, AlertCircle, TrendingUp, History, ChevronsUpDown } from 'lucide-react';

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

const SUBTASK_PRIORITIES = {
    'Alta': { label: 'Alta', color: 'text-red-500' },
    'Média': { label: 'Média', color: 'text-yellow-500' },
    'Baixa': { label: 'Baixa', color: 'text-blue-500' },
};

const TASK_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6', '#a3a3a3'];

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
    if (!startDate || !endDate) return [];
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

const calculateOkrProgress = (okr) => {
    if (!okr || !okr.keyResults || okr.keyResults.length === 0) {
        return 0;
    }
    const totalWeight = okr.keyResults.reduce((sum, kr) => sum + (kr.weight || 1), 0);
    if (totalWeight === 0) return 0;

    const weightedProgress = okr.keyResults.reduce((sum, kr) => {
        const start = kr.startValue || 0;
        const target = kr.targetValue || 100;
        const current = kr.currentValue || 0;
        const weight = kr.weight || 1;

        if (target === start) return sum;

        const progress = Math.max(0, Math.min(100, ((current - start) / (target - start)) * 100));
        return sum + (progress * weight);
    }, 0);

    return Math.round(weightedProgress / totalWeight);
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
        const [keyResults, setKeyResults] = useState(okr?.keyResults || [{ text: '', startValue: 0, targetValue: 100, currentValue: 0, weight: 1, updates: [] }]);

        const handleKrChange = (index, field, value) => {
            const newKrs = JSON.parse(JSON.stringify(keyResults));
            newKrs[index][field] = value;
            setKeyResults(newKrs);
        };

        const addKr = () => setKeyResults([...keyResults, { id: `kr_${Date.now()}`, text: '', startValue: 0, targetValue: 100, currentValue: 0, weight: 1, updates: [] }]);
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
                        <label className="block text-sm font-medium text-gray-600 mb-2">Resultados-Chave</label>
                        <div className="space-y-3">
                            {keyResults.map((kr, index) => (
                                <div key={kr.id || index} className="p-3 bg-white rounded-md border border-gray-200 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <input type="text" value={kr.text} onChange={e => handleKrChange(index, 'text', e.target.value)} placeholder={`KR ${index + 1}`} className="flex-grow p-2 border border-gray-300 rounded-md text-gray-800" />
                                        <button onClick={() => removeKr(index)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16} /></button>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <input type="number" value={kr.startValue || 0} onChange={e => handleKrChange(index, 'startValue', parseFloat(e.target.value))} title="Valor Inicial" placeholder="Inicial" className="p-2 border border-gray-300 rounded-md text-gray-800" />
                                        <input type="number" value={kr.targetValue || 100} onChange={e => handleKrChange(index, 'targetValue', parseFloat(e.target.value))} title="Meta" placeholder="Meta" className="p-2 border border-gray-300 rounded-md text-gray-800" />
                                        <input type="number" value={kr.currentValue || 0} onChange={e => handleKrChange(index, 'currentValue', parseFloat(e.target.value))} title="Valor Atual" placeholder="Atual" className="p-2 border border-gray-300 rounded-md text-gray-800" />
                                        <input type="number" value={kr.weight || 1} onChange={e => handleKrChange(index, 'weight', parseFloat(e.target.value))} title="Peso" placeholder="Peso" className="p-2 border border-gray-300 rounded-md text-gray-800" />
                                    </div>
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
                {isFormOpen && <OkrForm key={selectedOkr?.id || 'new'} okr={selectedOkr} onSave={handleSave} onCancel={() => setIsFormOpen(false)} />}
                
                <div className="mt-6 space-y-3">
                    {okrs.map(okr => (
                        <div key={okr.id} className="p-4 border border-gray-200 rounded-lg">
                           <div className="flex justify-between items-start">
                                <h4 className="font-bold text-gray-800">{okr.objective}</h4>
                               <div className="flex space-x-2 flex-shrink-0 ml-4">
                                   <Button onClick={() => handleEdit(okr)} variant="secondary" className="!p-2"><Edit size={16}/></Button>
                                   <Button onClick={() => onDelete(okr.id)} variant="danger" className="!p-2"><Trash2 size={16}/></Button>
                               </div>
                           </div>
                           <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${calculateOkrProgress(okr)}%` }}></div>
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
    const [selectedOkrPreview, setSelectedOkrPreview] = useState(null);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const colorPickerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
                setIsColorPickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (task) {
            setCurrentTask({ ...task, dependencies: task.dependencies || [], subtasks: task.subtasks || [] });
            if (task.okrId) {
                const okrToPreview = okrs.find(o => o.id === task.okrId);
                setSelectedOkrPreview(okrToPreview);
            } else {
                setSelectedOkrPreview(null);
            }
        } else {
            const today = new Date().toISOString().split('T')[0];
            setCurrentTask({
                title: '', description: '', priority: 'Média', status: 'A Fazer',
                startDate: today, endDate: today, isMilestone: false, okrId: '',
                dependencies: [], subtasks: [], projectTag: '', customColor: ''
            });
            setSelectedOkrPreview(null);
        }
    }, [task, isOpen, okrs]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setCurrentTask(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));

        if (name === 'okrId') {
            const okrToPreview = okrs.find(o => o.id === value);
            setSelectedOkrPreview(okrToPreview);
        }
    };

    const handleSubtaskChange = (index, field, value) => {
        const newSubtasks = [...currentTask.subtasks];
        newSubtasks[index][field] = value;
        setCurrentTask(prev => ({ ...prev, subtasks: newSubtasks }));
    };

    const addSubtask = () => {
        const newSubtask = { id: `sub_${Date.now()}`, text: '', completed: false, dueDate: '', priority: 'Média' };
        setCurrentTask(prev => ({ ...prev, subtasks: [...(prev.subtasks || []), newSubtask] }));
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
        <Modal isOpen={isOpen} onClose={onClose} title={task?.humanId ? `Editar Tarefa [${task.humanId}]` : "Nova Tarefa"}>
            <div className="space-y-6 text-gray-700">
                <input type="text" name="title" value={currentTask.title || ''} onChange={handleChange} placeholder="Título da Tarefa" className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800" />
                <textarea name="description" value={currentTask.description || ''} onChange={handleChange} placeholder="Descrição" className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800 h-24"></textarea>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">Tag do Projeto</label>
                        <input type="text" name="projectTag" value={currentTask.projectTag || ''} onChange={handleChange} placeholder="Ex: App V2" className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800" />
                    </div>
                     <div className="relative" ref={colorPickerRef}>
                        <label className="block text-sm font-medium text-gray-500 mb-1">Cor da Tarefa</label>
                        <button onClick={() => setIsColorPickerOpen(prev => !prev)} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md flex items-center justify-between">
                            <span>{currentTask.customColor || 'Padrão (por prioridade)'}</span>
                            <div className="w-6 h-6 rounded" style={{ backgroundColor: currentTask.customColor || '#e5e7eb' }}></div>
                        </button>
                        {isColorPickerOpen && (
                            <div className="absolute z-10 top-full mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg p-4">
                                <div className="grid grid-cols-7 gap-2 mb-4">
                                    {TASK_COLORS.map(color => (
                                        <button key={color} onClick={() => {handleChange({ target: { name: 'customColor', value: color }}); setIsColorPickerOpen(false);}} className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${currentTask.customColor === color ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`} style={{ backgroundColor: color }} />
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <label htmlFor="color-picker" className="text-sm">Cor Customizada:</label>
                                    <input id="color-picker" type="color" value={currentTask.customColor || '#ffffff'} onChange={(e) => handleChange({target: {name: 'customColor', value: e.target.value}})} className="w-8 h-8 rounded-md border-none cursor-pointer" />
                                </div>
                                <Button onClick={() => {handleChange({ target: { name: 'customColor', value: '' }}); setIsColorPickerOpen(false);}} variant="secondary" className="w-full mt-4 text-sm">Limpar Cor</Button>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">Prioridade</label>
                        <select name="priority" value={currentTask.priority || 'Média'} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800">
                            {Object.keys(PRIORITIES).map(p => <option key={p} value={p}>{PRIORITIES[p].label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
                        <select name="status" value={currentTask.status || 'A Fazer'} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800">
                            {Object.keys(STATUSES).map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">Data de Início</label>
                        <input type="date" name="startDate" value={currentTask.startDate || ''} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">Data de Fim</label>
                        <input type="date" name="endDate" value={currentTask.endDate || ''} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800" />
                    </div>
                </div>

                <div>
                    <h4 className="text-md font-semibold text-gray-600 mb-2">Subtarefas</h4>
                    <div className="space-y-1">
                        {currentTask.subtasks && currentTask.subtasks.map((sub, index) => (
                            <div key={sub.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-b-0">
                                <input type="checkbox" checked={sub.completed} onChange={(e) => handleSubtaskChange(index, 'completed', e.target.checked)} className="form-checkbox h-5 w-5 bg-gray-200 border-gray-300 rounded text-indigo-600 focus:ring-indigo-500 flex-shrink-0"/>
                                <input type="text" value={sub.text} onChange={(e) => handleSubtaskChange(index, 'text', e.target.value)} className={`flex-grow p-1 bg-transparent border-none focus:ring-0 text-gray-800 ${sub.completed ? 'line-through text-gray-500' : ''}`} placeholder="Descrição da subtarefa" />
                                <input type="date" value={sub.dueDate || ''} onChange={(e) => handleSubtaskChange(index, 'dueDate', e.target.value)} className="p-1 bg-gray-100 border border-gray-300 rounded-md text-gray-800 text-sm" />
                                <div className="flex items-center gap-1">
                                    {Object.keys(SUBTASK_PRIORITIES).map(p => (
                                        <button key={p} onClick={() => handleSubtaskChange(index, 'priority', p)} title={p}>
                                            <AlertCircle size={16} className={`${SUBTASK_PRIORITIES[p].color} ${sub.priority === p ? 'fill-current' : ''}`} />
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => removeSubtask(index)} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                    <Button onClick={addSubtask} variant="secondary" className="mt-2 text-sm"><Plus size={16}/> Adicionar Subtarefa</Button>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500">Vincular ao OKR</label>
                    <select name="okrId" value={currentTask.okrId || ''} onChange={handleChange} className="w-full p-2 bg-gray-100 border border-gray-300 rounded-md text-gray-800">
                        <option value="">Nenhum</option>
                        {okrs.map(okr => <option key={okr.id} value={okr.id}>{okr.objective}</option>)}
                    </select>
                    {selectedOkrPreview && (
                        <div className="mt-2 p-2 bg-gray-50 rounded-md border">
                            <div className="flex justify-between items-baseline mb-1">
                                <span className="text-sm font-semibold text-gray-600">{selectedOkrPreview.objective}</span>
                                <span className="text-sm font-bold text-indigo-600">{calculateOkrProgress(selectedOkrPreview)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${calculateOkrProgress(selectedOkrPreview)}%` }}></div>
                            </div>
                        </div>
                    )}
                </div>

                <footer className="flex justify-between items-center space-x-4 pt-6 mt-6 border-t border-gray-200">
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

const Timeline = ({ tasks, onTaskClick, timeScale, dateOffset, setDateOffset, dependencyLines }) => {
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    
    const timelineRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    const handleNavigate = (direction) => {
        setDateOffset(prev => prev + direction);
    };
    
    const onMouseDown = (e) => {
        setIsDragging(true);
        setStartX(e.pageX - timelineRef.current.offsetLeft);
        setScrollLeft(timelineRef.current.scrollLeft);
        timelineRef.current.style.cursor = 'grabbing';
    };

    const onMouseLeaveOrUp = () => {
        setIsDragging(false);
        if (timelineRef.current) {
            timelineRef.current.style.cursor = 'grab';
        }
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - timelineRef.current.offsetLeft;
        const walk = (x - startX) * 3; // Scroll-fast
        timelineRef.current.scrollLeft = scrollLeft - walk;
    };


    const dateInfo = useMemo(() => {
        const now = new Date();
        let start, end;

        switch (timeScale) {
            case 'Semanal':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + (dateOffset * 7));
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                break;
            case 'Mensal':
                start = new Date(now.getFullYear(), now.getMonth() + dateOffset, 1);
                end = new Date(now.getFullYear(), now.getMonth() + dateOffset + 1, 0);
                break;
            case 'Trimestral':
                const currentQuarter = Math.floor(now.getMonth() / 3);
                const targetQuarter = currentQuarter + dateOffset;
                start = new Date(now.getFullYear(), targetQuarter * 3, 1);
                end = new Date(now.getFullYear(), targetQuarter * 3 + 3, 0);
                break;
            case 'Anual':
                start = new Date(now.getFullYear() + dateOffset, 0, 1);
                end = new Date(now.getFullYear() + dateOffset, 11, 31);
                break;
            default:
                start = new Date(); end = new Date(); break;
        }
        return { startDate: start, endDate: end };
    }, [timeScale, dateOffset]);

    const { startDate, endDate } = dateInfo;

    const days = useMemo(() => getDaysInView(startDate, endDate), [startDate, endDate]);
    const dayWidth = 50;
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

    const groupedTasks = useMemo(() => {
        return tasks.reduce((acc, task) => {
            const group = task.projectTag || 'Geral';
            if (!acc[group]) {
                acc[group] = [];
            }
            acc[group].push(task);
            return acc;
        }, {});
    }, [tasks]);

    const [collapsedGroups, setCollapsedGroups] = useState({});
    const toggleGroup = (group) => {
        setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const todayPosition = (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) * dayWidth;

    return (
        <div className="relative bg-white border border-gray-200 rounded-lg shadow-sm">
             <div className="sticky top-0 z-30 bg-white/70 backdrop-blur-sm p-2 border-b border-gray-200 flex justify-end">
                <div className="flex items-center gap-2">
                    <button onClick={() => handleNavigate(-1)} className="p-1 rounded-full hover:bg-gray-200 transition-colors"><ChevronLeft size={20} /></button>
                    <button onClick={() => handleNavigate(1)} className="p-1 rounded-full hover:bg-gray-200 transition-colors"><ChevronRight size={20} /></button>
                </div>
            </div>
            <div 
                className="overflow-x-auto cursor-grab"
                ref={timelineRef}
                onMouseDown={onMouseDown}
                onMouseLeave={onMouseLeaveOrUp}
                onMouseUp={onMouseLeaveOrUp}
                onMouseMove={onMouseMove}
            >
                <div style={{ width: timelineWidth }} className="relative">
                    {/* Headers */}
                    <div className="sticky top-0 z-20">
                        <div className="flex bg-gray-100 h-12">
                            {months.map((month, index) => (
                                <div key={index} className="flex items-center justify-center text-center font-semibold text-gray-700 border-b-2 border-r border-gray-200 py-2 whitespace-nowrap px-2" style={{ width: month.days * dayWidth }}>
                                    {month.label}
                                </div>
                            ))}
                        </div>
                        <div className="flex bg-gray-100">
                            {days.map((day, index) => (
                                <div key={index} className="flex-shrink-0 text-center border-b border-r border-gray-200 py-1" style={{ width: dayWidth }}>
                                    <div className={`text-xs ${day.toDateString() === today.toDateString() ? 'text-indigo-600' : 'text-gray-500'}`}>
                                        {new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day).slice(0,3)}
                                    </div>
                                    <div className={`text-lg font-semibold ${day.toDateString() === today.toDateString() ? 'text-indigo-600' : 'text-gray-800'}`}>
                                        {day.getDate()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Grid and Today Marker */}
                    <div className="absolute top-0 left-0 w-full h-full z-0">
                        <div className="flex h-full">
                            {days.map((day, index) => (
                                <div key={index} className={`h-full border-r ${day.getDay() === 0 || day.getDay() === 6 ? 'bg-gray-50' : 'border-gray-100'}`} style={{ width: dayWidth }}></div>
                            ))}
                        </div>
                        {todayPosition >= 0 && todayPosition <= timelineWidth && (
                            <div className="absolute top-0 h-full w-0.5 bg-red-500 z-10" style={{ left: todayPosition }}></div>
                        )}
                    </div>
                    
                    {/* Task Groups */}
                    <div className="relative z-10">
                        {Object.keys(groupedTasks).map((group, groupIndex) => {
                            const isCollapsed = collapsedGroups[group];
                            return (
                                <div key={group}>
                                    <div className="sticky top-[104px] z-20 flex items-center h-10 bg-white border-b border-t border-gray-200 -ml-px" onClick={() => toggleGroup(group)}>
                                        <div className="flex items-center gap-2 p-2 cursor-pointer">
                                            <ChevronsUpDown size={16} className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                            <h3 className="font-bold text-gray-800">{group}</h3>
                                        </div>
                                    </div>
                                    {!isCollapsed && (
                                        <div className="relative" style={{ height: groupedTasks[group].length * 52 + 20 }}>
                                            {groupedTasks[group].map((task, taskIndex) => {
                                                const taskStart = new Date(task.startDate);
                                                taskStart.setUTCHours(0,0,0,0);
                                                const taskEnd = new Date(task.endDate);
                                                taskEnd.setUTCHours(0,0,0,0);

                                                const startOffset = Math.max(0, (taskStart - startDate) / (1000 * 60 * 60 * 24));
                                                const duration = Math.max(1, (taskEnd - taskStart) / (1000 * 60 * 60 * 24) + 1);
                                                
                                                const left = startOffset * dayWidth;
                                                const width = duration * dayWidth - 8;

                                                if (taskEnd < startDate || taskStart > endDate) return null;

                                                const priorityColor = (PRIORITIES[task.priority] || PRIORITIES['Média']).color;
                                                
                                                const subtaskProgress = task.subtasks && task.subtasks.length > 0
                                                    ? (task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100
                                                    : (task.status === 'Concluído' ? 100 : 0);

                                                return (
                                                    <div
                                                        key={task.id}
                                                        id={`task-${task.id}`}
                                                        className="h-11 absolute flex items-center rounded-lg cursor-pointer transition-all duration-200 group"
                                                        style={{ top: `${taskIndex * 52 + 10}px`, left: `${left}px`, width: `${width}px` }}
                                                        onClick={() => onTaskClick(task)}
                                                        title={task.title}
                                                    >
                                                        <div className={`h-full w-full rounded-lg flex items-center px-3 overflow-hidden relative shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-200 ${!task.customColor && priorityColor}`} style={{ backgroundColor: task.customColor }}>
                                                            <div className="absolute top-0 left-0 h-full bg-black/20 rounded-lg" style={{ width: `${subtaskProgress}%` }}></div>
                                                            {task.isMilestone && <Flag className="text-white mr-2 flex-shrink-0 z-10" size={16} />}
                                                            <p className="text-sm font-semibold text-white truncate z-10">
                                                                <span className="font-mono text-xs bg-black/20 px-1 py-0.5 rounded-sm mr-2">{task.humanId}</span>
                                                                {task.title}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ... (FilterGroup e ExecutiveView permanecem os mesmos)
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

const WorkspaceView = ({ tasks, onTaskClick, filters, setFilters, timeScale, setTimeScale, dependencyLines, dateOffset, setDateOffset }) => {
    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <FilterGroup title="Prioridade" options={PRIORITIES} active={filters.priority} onFilterChange={val => setFilters({...filters, priority: val})}/>
                        <FilterGroup title="Status" options={STATUSES} active={filters.status} onFilterChange={val => setFilters({...filters, status: val})}/>
                    </div>
                    <select value={timeScale} onChange={e => { setTimeScale(e.target.value); setDateOffset(0); }} className="bg-gray-100 border-gray-300 text-gray-800 rounded-md p-2">
                        <option>Semanal</option>
                        <option>Mensal</option>
                        <option>Trimestral</option>
                        <option>Anual</option>
                    </select>
                </div>
            </Card>
            <Timeline tasks={tasks} onTaskClick={onTaskClick} timeScale={timeScale} dependencyLines={dependencyLines} dateOffset={dateOffset} setDateOffset={setDateOffset} />
        </div>
    );
};

const ExecutiveView = ({ tasks, okrs }) => {
    const okrProgress = useMemo(() => {
        return okrs.map(okr => ({
            ...okr,
            progress: calculateOkrProgress(okr)
        }));
    }, [okrs]);

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
                        </div>
                    )) : <p className="text-gray-500">Nenhum OKR definido.</p>}
                </div>
            </Card>
            <Card>
                 <h3 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center"><Flag className="mr-3 text-yellow-500" />Marcos (Milestones)</h3>
                 <div className="space-y-4">
                    {milestones.length > 0 ? milestones.map(milestone => (
                        <div key={milestone.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div>
                                <p className="font-semibold text-gray-700">[{milestone.humanId}] {milestone.title}</p>
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
    const [dateOffset, setDateOffset] = useState(0);
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
            const newTask = {
                ...taskData,
                humanId: `T-${Date.now().toString().slice(-6)}`
            };
            await addDoc(collection(db, collectionPath), newTask);
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
        return tasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
                    .filter(task => {
                        const priorityMatch = filters.priority === 'Todos' || task.priority === filters.priority;
                        const statusMatch = filters.status === 'Todos' || task.status === filters.status;
                        return priorityMatch && statusMatch;
                    });
    }, [tasks, filters]);
    
    const calculateDependencyLines = useCallback(() => {
        // This function would need a significant rewrite to support grouped tasks
        // For now, we'll disable it to prevent errors.
        setDependencyLines([]);
    }, [filteredTasks, timeScale, dateOffset]);

    useEffect(() => {
        const timer = setTimeout(calculateDependencyLines, 500);
        window.addEventListener('resize', calculateDependencyLines);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', calculateDependencyLines);
        };
    }, [filteredTasks, timeScale, dateOffset, calculateDependencyLines]);

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
                                dateOffset={dateOffset}
                                setDateOffset={setDateOffset}
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
