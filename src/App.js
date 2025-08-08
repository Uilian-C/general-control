import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, serverTimestamp } from 'firebase/firestore';
import { Target, Flag, Plus, Trash2, X, Layers, Briefcase, Edit, Settings, Tag, Palette, TrendingUp, Download, Calendar, ListTodo, ZoomIn, ZoomOut, ChevronsUpDown, CheckCircle, MoreVertical, History, Check, Zap, ChevronDown } from 'lucide-react';

// --- Configuração do Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyCESjyYypWPaerOk9jGE2uvcjZlsuH_YrI",
  authDomain: "general-control-fb57b.firebaseapp.com",
  projectId: "general-control-fb57b",
  storageBucket: "general-control-fb57b.appspot.com",
  messagingSenderId: "939076716946",
  appId: "1:939076716946:web:176240d8cb942b12df194b"
};

// --- Inicialização Segura do Firebase ---
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
const auth = getAuth(app);
const db = getFirestore(app);

// --- Constantes e Helpers ---
const PRIORITIES = {
  'Alta': { label: 'Alta', color: 'bg-red-400' },
  'Média': { label: 'Média', color: 'bg-yellow-400' },
  'Baixa': { label: 'Baixa', color: 'bg-blue-400' },
};
const STATUSES = {
  'A Fazer': { label: 'A Fazer', color: 'bg-gray-200 text-gray-800', iconColor: 'text-gray-400' },
  'Em Progresso': { label: 'Em Progresso', color: 'bg-indigo-200 text-indigo-800', iconColor: 'text-indigo-400' },
  'Concluído': { label: 'Concluído', color: 'bg-green-200 text-green-800', iconColor: 'text-green-500' },
};
const TASK_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6', '#a3a3a3'];

const formatDate = (dateInput) => {
  if (!dateInput) return '';
  const date = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
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

// --- Lógica de Cálculo de OKR (Revisada e Comentada) ---
const calculateKrProgress = (kr) => {
    const start = Number(kr.startValue) || 0;
    const target = Number(kr.targetValue) || 100;
    const current = Number(kr.currentValue) || 0;
    if (target === start) return current >= target ? 100 : 0;
    const progress = ((current - start) / (target - start)) * 100;
    return Math.max(0, Math.min(100, progress));
};

const calculateOkrProgress = (okr) => {
    if (!okr || !okr.keyResults || okr.keyResults.length === 0) return 0;
    const keyResults = okr.keyResults;
    const totalWeight = keyResults.reduce((sum, kr) => sum + (Number(kr.weight) || 1), 0);
    if (totalWeight === 0) return 0;
    const weightedProgressSum = keyResults.reduce((sum, kr) => {
        const progress = calculateKrProgress(kr);
        const weight = Number(kr.weight) || 1;
        return sum + (progress * weight);
    }, 0);
    return Math.round(weightedProgressSum / totalWeight);
};


// --- Componentes da UI ---
const Card = ({ children, className = '' }) => (
    <div className={`bg-white border border-gray-200 rounded-xl p-6 shadow-sm ${className}`}>
        {children}
    </div>
);

const Button = ({ onClick, children, className = '', variant = 'primary', disabled = false }) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    const variantClasses = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
        ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-400'
    };
    return (
        <button onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled}>
            {children}
        </button>
    );
};

const Modal = ({ isOpen, onClose, title, children, size = '2xl' }) => {
    if (!isOpen) return null;
    const sizeClasses = { 'md': 'max-w-md', '2xl': 'max-w-2xl', '4xl': 'max-w-4xl' };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className={`bg-white rounded-xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col`}>
                <header className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                </header>
                <main className="p-6 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
};

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
            <div className="text-gray-600">{children}</div>
            <footer className="flex justify-end space-x-4 pt-4 mt-4 border-t">
                <Button onClick={onClose} variant="secondary">Cancelar</Button>
                <Button onClick={onConfirm} variant="danger">Confirmar</Button>
            </footer>
        </Modal>
    );
};

const TaskModal = ({ isOpen, onClose, task, tasks, okrs, onSave, onDeleteRequest }) => {
    const [currentTask, setCurrentTask] = useState({});
    const [selectedOkrPreview, setSelectedOkrPreview] = useState(null);
    const cleanInputClass = "w-full p-2 bg-transparent border-b-2 border-gray-200 focus:border-indigo-500 focus:outline-none focus:ring-0 transition-colors";
    const cleanSelectClass = `${cleanInputClass} appearance-none`;
    const sectionClass = "py-6 border-b border-gray-200 last:border-b-0";
    
    useEffect(() => {
        if (task) {
            setCurrentTask({ ...task, dependencies: task.dependencies || [], subtasks: task.subtasks || [], customColor: task.customColor || '' });
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
        let finalValue = type === 'checkbox' ? checked : value;
        setCurrentTask(prev => ({ ...prev, [name]: finalValue }));
        if (name === 'okrId') {
            const okrToPreview = okrs.find(o => o.id === value);
            setSelectedOkrPreview(okrToPreview);
        }
    };
    
    const handleColorChange = (color) => setCurrentTask(prev => ({ ...prev, customColor: color }));
    
    const handleSubtaskChange = (index, field, value) => {
        const newSubtasks = [...currentTask.subtasks];
        newSubtasks[index][field] = value;
        setCurrentTask(prev => ({ ...prev, subtasks: newSubtasks }));
    };

    const addSubtask = () => {
        const newSubtask = { id: `sub_${Date.now()}`, text: '', completed: false };
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

    if (!isOpen) return null;
    
    const okrProgress = selectedOkrPreview ? calculateOkrProgress(selectedOkrPreview) : 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={task?.humanId ? `Editar Tarefa [${task.humanId}]` : "Nova Tarefa"} size="2xl">
            <div className="space-y-0 text-gray-700">
                <section className={sectionClass}>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"><Edit size={18} className="text-gray-400" /> Detalhes Principais</h3>
                    <div className="space-y-4">
                        <input type="text" name="title" value={currentTask.title || ''} onChange={handleChange} placeholder="Título da Tarefa" className={`${cleanInputClass} text-2xl font-bold`} />
                        <textarea name="description" value={currentTask.description || ''} onChange={handleChange} placeholder="Adicione uma descrição..." className={`${cleanInputClass} h-20`}></textarea>
                    </div>
                </section>
                <section className={sectionClass}>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"><Calendar size={18} className="text-gray-400" /> Planejamento</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <div>
                            <label className="block text-xs font-medium text-gray-500">Início</label>
                            <input type="date" name="startDate" value={currentTask.startDate || ''} onChange={handleChange} className={cleanInputClass} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500">Fim</label>
                            <input type="date" name="endDate" value={currentTask.endDate || ''} onChange={handleChange} className={cleanInputClass} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500">Prioridade</label>
                            <select name="priority" value={currentTask.priority || 'Média'} onChange={handleChange} className={cleanSelectClass}>
                                {Object.keys(PRIORITIES).map(p => <option key={p} value={p}>{PRIORITIES[p].label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500">Status</label>
                            <select name="status" value={currentTask.status || 'A Fazer'} onChange={handleChange} className={cleanSelectClass}>
                                {Object.keys(STATUSES).map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}
                            </select>
                        </div>
                    </div>
                </section>
                <section className={sectionClass}>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"><ListTodo size={18} className="text-gray-400" /> Subtarefas</h3>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                        {currentTask.subtasks && currentTask.subtasks.map((sub, index) => (
                            <div key={sub.id} className="flex items-center gap-3 py-1 border-b border-gray-100 last:border-b-0">
                                <input type="checkbox" checked={sub.completed} onChange={(e) => handleSubtaskChange(index, 'completed', e.target.checked)} className="form-checkbox h-5 w-5 bg-gray-200 border-gray-300 rounded text-indigo-600 focus:ring-indigo-500 flex-shrink-0" />
                                <input type="text" value={sub.text} onChange={(e) => handleSubtaskChange(index, 'text', e.target.value)} className={`flex-grow p-1 bg-transparent border-none focus:ring-0 text-gray-800 ${sub.completed ? 'line-through text-gray-500' : ''}`} placeholder="Descrição da subtarefa" />
                                <button onClick={() => removeSubtask(index)} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                    <Button onClick={addSubtask} variant="secondary" className="mt-4 text-sm"><Plus size={16} /> Adicionar Subtarefa</Button>
                </section>
                <section className={sectionClass}>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"><Target size={18} className="text-gray-400" /> Conexões e Tags</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <div>
                            <label className="block text-xs font-medium text-gray-500">Vincular ao OKR</label>
                            <select name="okrId" value={currentTask.okrId || ''} onChange={handleChange} className={cleanSelectClass}>
                                <option value="">Nenhum</option>
                                {okrs.map(okr => <option key={okr.id} value={okr.id}>{okr.objective}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="block text-xs font-medium text-gray-500">Tag do Projeto</label>
                            <input type="text" name="projectTag" value={currentTask.projectTag || ''} onChange={handleChange} placeholder="#nome-do-projeto" className={cleanInputClass} />
                        </div>
                    </div>
                    {selectedOkrPreview && (
                        <div className="mt-4 pt-3 border-t border-gray-200">
                            <div className="flex justify-between items-baseline mb-1">
                                <span className="text-sm font-semibold text-gray-600">{selectedOkrPreview.objective}</span>
                                <span className="text-sm font-bold text-indigo-600">{okrProgress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${okrProgress}%` }}></div></div>
                        </div>
                    )}
                </section>
                <footer className="flex justify-between items-center space-x-4 pt-6 mt-2">
                    <div>{task && <Button onClick={() => onDeleteRequest(task.id)} variant="danger"><Trash2 size={16} /> Excluir</Button>}</div>
                    <div className="flex items-center space-x-4">
                        <Button onClick={onClose} variant="secondary">Cancelar</Button>
                        <Button onClick={handleSave} variant="primary">Salvar</Button>
                    </div>
                </footer>
            </div>
        </Modal>
    );
};

const Timeline = ({ tasks, onTaskClick, zoomLevel, setViewStartDate, viewStartDate }) => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const timelineRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const dayWidth = useMemo(() => 20 + (zoomLevel * 4), [zoomLevel]);
    const numDaysInView = useMemo(() => {
        if (!timelineRef.current) return 30;
        return Math.floor(timelineRef.current.clientWidth / dayWidth);
    }, [dayWidth, timelineRef.current?.clientWidth]);
    const endDate = useMemo(() => {
        const end = new Date(viewStartDate);
        end.setDate(end.getDate() + numDaysInView);
        return end;
    }, [viewStartDate, numDaysInView]);
    const days = useMemo(() => getDaysInView(viewStartDate, endDate), [viewStartDate, endDate]);
    const timelineWidth = days.length * dayWidth;
    const onMouseDown = (e) => { setIsDragging(true); setStartX(e.pageX - timelineRef.current.offsetLeft); setScrollLeft(timelineRef.current.scrollLeft); timelineRef.current.style.cursor = 'grabbing'; };
    const onMouseLeaveOrUp = () => { setIsDragging(false); if (timelineRef.current) { timelineRef.current.style.cursor = 'grab'; } };
    const onMouseMove = (e) => { if (!isDragging) return; e.preventDefault(); const x = e.pageX - timelineRef.current.offsetLeft; const walk = (x - startX); timelineRef.current.scrollLeft = scrollLeft - walk; };
    const headerGroups = useMemo(() => {
        const groups = []; if (!days.length) return groups; let currentGroup = null;
        if (dayWidth < 25) {
            days.forEach(day => {
                const monthKey = `${day.getFullYear()}-${day.getMonth()}`;
                if (!currentGroup || currentGroup.key !== monthKey) { currentGroup = { key: monthKey, label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(day), width: 0 }; groups.push(currentGroup); }
                currentGroup.width += dayWidth;
            });
        } else if (dayWidth < 50) {
            days.forEach(day => {
                const year = day.getFullYear(); const weekNumber = Math.ceil((((day - new Date(year, 0, 1)) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7); const weekKey = `${year}-W${weekNumber}`;
                if (!currentGroup || currentGroup.key !== weekKey) { currentGroup = { key: weekKey, label: `Semana ${weekNumber}`, width: 0 }; groups.push(currentGroup); }
                currentGroup.width += dayWidth;
            });
        } else {
            days.forEach(day => { groups.push({ key: day.toISOString(), label: day.getDate(), subLabel: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day).slice(0, 3), width: dayWidth, isToday: day.toDateString() === today.toDateString() }); });
        }
        return groups;
    }, [days, dayWidth]);
    const groupedTasks = useMemo(() => {
        return tasks.reduce((acc, task) => { const group = task.projectTag || 'Geral'; if (!acc[group]) { acc[group] = []; } acc[group].push(task); return acc; }, {});
    }, [tasks]);
    const [collapsedGroups, setCollapsedGroups] = useState({});
    const toggleGroup = (group) => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    const todayPosition = (today.getTime() - viewStartDate.getTime()) / (1000 * 60 * 60 * 24) * dayWidth;
    return (
        <div className="relative bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="overflow-x-auto cursor-grab" ref={timelineRef} onMouseDown={onMouseDown} onMouseLeave={onMouseLeaveOrUp} onMouseUp={onMouseLeaveOrUp} onMouseMove={onMouseMove}>
                <div style={{ width: timelineWidth }} className="relative">
                    <div className="sticky top-0 z-20 bg-gray-50 h-12">
                        <div className="flex border-b-2 border-gray-200">
                             {headerGroups.map((group) => (<div key={group.key} className="flex-shrink-0 text-center font-semibold text-gray-700 border-r border-gray-200 py-1 flex flex-col justify-center items-center" style={{ width: group.width }}>{group.subLabel && <span className={`text-xs ${group.isToday ? 'text-indigo-600' : 'text-gray-500'}`}>{group.subLabel}</span>}<span className={`whitespace-nowrap ${group.isToday ? 'text-indigo-600 font-bold' : ''}`}>{group.label}</span></div>))}
                        </div>
                    </div>
                    <div className="absolute top-0 left-0 w-full h-full z-0">
                        <div className="flex h-full">{days.map((day, index) => (<div key={index} className={`h-full border-r ${day.getDay() === 0 || day.getDay() === 6 ? 'bg-gray-50/50' : 'border-gray-100'}`} style={{ width: dayWidth }}></div>))}</div>
                        {todayPosition >= 0 && todayPosition <= timelineWidth && (<div className="absolute top-0 h-full w-0.5 bg-red-500/70 z-10" style={{ left: todayPosition }}><div className="absolute -top-1 -translate-x-1/2 left-1/2 bg-red-500 rounded-full w-2 h-2"></div></div>)}
                    </div>
                    <div className="relative z-10 pt-2">
                        {Object.keys(groupedTasks).sort().map((group) => {
                            const isCollapsed = collapsedGroups[group];
                            return (
                                <div key={group}>
                                    <div className="sticky top-[48px] z-20 flex items-center h-10 bg-white/80 backdrop-blur-sm border-b border-t border-gray-200 -ml-px" onClick={() => toggleGroup(group)}>
                                        <div className="flex items-center gap-2 p-2 cursor-pointer"><ChevronsUpDown size={16} className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`} /><h3 className="font-bold text-gray-800">{group}</h3></div>
                                    </div>
                                    {!isCollapsed && (
                                        <div className="relative" style={{ height: groupedTasks[group].length * 48 + 10 }}>
                                            {groupedTasks[group].map((task, taskIndex) => {
                                                const taskStart = new Date(task.startDate); taskStart.setUTCHours(0, 0, 0, 0); const taskEnd = new Date(task.endDate); taskEnd.setUTCHours(0, 0, 0, 0);
                                                if (taskEnd < viewStartDate || taskStart > endDate) return null;
                                                const startOffset = (taskStart - viewStartDate) / (1000 * 60 * 60 * 24); const duration = Math.max(1, (taskEnd - taskStart) / (1000 * 60 * 60 * 24) + 1); const left = startOffset * dayWidth; const width = duration * dayWidth - 4;
                                                const subtaskProgress = task.subtasks && task.subtasks.length > 0 ? (task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100 : (task.status === 'Concluído' ? 100 : 0);
                                                return (
                                                    <div key={task.id} id={`task-${task.id}`} className="h-10 absolute flex items-center rounded-lg cursor-pointer transition-all duration-200 group" style={{ top: `${taskIndex * 48 + 5}px`, left: `${left}px`, width: `${width}px` }} onClick={() => onTaskClick(task)} title={`${task.title} - ${STATUSES[task.status]?.label} (${Math.round(subtaskProgress)}%)`}>
                                                        <div className={`h-full w-full rounded-lg flex items-center overflow-hidden relative shadow-md group-hover:shadow-lg group-hover:scale-[1.02] transition-all duration-200 ${!task.customColor ? 'bg-gradient-to-r from-gray-400 to-gray-500' : ''}`} style={task.customColor ? { backgroundColor: task.customColor } : {}}>
                                                            <div className="absolute top-0 left-0 h-full bg-black/20" style={{ width: `${subtaskProgress}%` }}></div>
                                                            {!task.customColor && <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-sky-500 opacity-80" style={{ width: `${subtaskProgress}%` }}></div>}
                                                            <div className="relative z-10 flex items-center justify-between w-full px-2">
                                                                <p className="text-sm font-semibold text-white truncate flex-grow">{task.title}</p>
                                                                <div className="flex items-center gap-2 flex-shrink-0">{width > 150 && (<span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUSES[task.status]?.color} bg-opacity-70 backdrop-blur-sm`}>{STATUSES[task.status]?.label}</span>)}{width > 80 && (<span className="text-xs text-white font-semibold bg-black/20 px-1.5 py-0.5 rounded-full">{Math.round(subtaskProgress)}%</span>)}</div>
                                                            </div>
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

const FilterGroup = ({ title, options, active, onFilterChange }) => (
    <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-600">{title}:</span>
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-1">
            <button onClick={() => onFilterChange('Todos')} className={`px-3 py-1 text-sm rounded-md transition-colors ${active === 'Todos' ? 'bg-white shadow-sm text-indigo-600 font-semibold' : 'text-gray-600 hover:bg-gray-200'}`}>Todos</button>
            {Object.keys(options).map(key => (<button key={key} onClick={() => onFilterChange(key)} className={`px-3 py-1 text-sm rounded-md transition-colors ${active === key ? 'bg-white shadow-sm text-indigo-600 font-semibold' : 'text-gray-600 hover:bg-gray-200'}`}>{options[key].label}</button>))}
        </div>
    </div>
);

const WorkspaceView = ({ tasks, onTaskClick, filters, setFilters, zoomLevel, setZoomLevel, viewStartDate, setViewStartDate, onOpenTaskModal }) => {
    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2"><Button onClick={() => setViewStartDate(new Date())} variant="secondary">Hoje</Button></div>
                    <div className="flex flex-wrap justify-center items-center gap-4">
                        <FilterGroup title="Prioridade" options={PRIORITIES} active={filters.priority} onFilterChange={val => setFilters({...filters, priority: val})}/>
                        <FilterGroup title="Status" options={STATUSES} active={filters.status} onFilterChange={val => setFilters({...filters, status: val})}/>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setZoomLevel(z => Math.max(1, z - 1))} className="p-2 rounded-full hover:bg-gray-200 transition-colors"><ZoomOut size={20} /></button>
                        <input type="range" min="1" max="10" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} className="w-24" />
                        <button onClick={() => setZoomLevel(z => Math.min(10, z + 1))} className="p-2 rounded-full hover:bg-gray-200 transition-colors"><ZoomIn size={20} /></button>
                    </div>
                </div>
            </Card>
            <Timeline tasks={tasks} onTaskClick={onTaskClick} zoomLevel={zoomLevel} setViewStartDate={setViewStartDate} viewStartDate={viewStartDate} />
            <div className="mt-6 flex justify-end gap-4">
                <Button onClick={() => onOpenTaskModal()} variant="primary"><Plus size={20} className="mr-2" /> Nova Tarefa</Button>
            </div>
        </div>
    );
};

const ExecutiveView = ({ tasks, okrs }) => {
    const okrProgress = useMemo(() => {
        return okrs.map(okr => ({ ...okr, progress: calculateOkrProgress(okr) }));
    }, [okrs]);
    const milestones = useMemo(() => tasks.filter(t => t.isMilestone).sort((a, b) => new Date(a.startDate) - new Date(b.startDate)), [tasks]);
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
                            <div className="w-full bg-gray-200 rounded-full h-4"><div className="bg-indigo-600 h-4 rounded-full transition-all duration-500" style={{ width: `${okr.progress}%` }}></div></div>
                        </div>
                    )) : <p className="text-gray-500">Nenhum OKR definido.</p>}
                </div>
            </Card>
            <Card>
                 <h3 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center"><Flag className="mr-3 text-yellow-500" />Marcos (Milestones)</h3>
                 <div className="space-y-4">
                    {milestones.length > 0 ? milestones.map(milestone => (
                        <div key={milestone.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div><p className="font-semibold text-gray-700">[{milestone.humanId}] {milestone.title}</p><p className="text-sm text-gray-500">{milestone.description}</p></div>
                            <div className="text-right flex-shrink-0 ml-4"><p className={`text-sm font-bold px-3 py-1 rounded-full ${STATUSES[milestone.status]?.color || 'bg-gray-200 text-gray-800'}`}>{milestone.status}</p><p className="text-xs text-gray-500 mt-1">{formatDate(milestone.startDate)} - {formatDate(milestone.endDate)}</p></div>
                        </div>
                    )) : <p className="text-gray-500">Nenhum marco definido no roadmap.</p>}
                 </div>
            </Card>
        </div>
    );
};

// --- NOVOS COMPONENTES DE OKR ---

const OkrForm = ({ okr, onSave, onCancel }) => {
    const [objective, setObjective] = useState(okr?.objective || '');
    const [keyResults, setKeyResults] = useState(okr?.keyResults || []);

    const handleKrChange = (index, field, value) => {
        const newKrs = [...keyResults];
        const numericFields = ['startValue', 'targetValue', 'weight'];
        newKrs[index][field] = numericFields.includes(field) ? parseFloat(value) || 0 : value;
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
        <Card className="border-indigo-300 border-2 mt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{okr ? 'Editar Objetivo' : 'Novo Objetivo'}</h3>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Objetivo</label>
                    <input type="text" value={objective} onChange={e => setObjective(e.target.value)} placeholder="Ex: Lançar o melhor produto do mercado" className="w-full p-2 bg-white border border-gray-300 rounded-md text-gray-800" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Resultados-Chave</label>
                    <div className="space-y-3">
                        {keyResults.map((kr, index) => (
                            <div key={kr.id || index} className="p-3 bg-gray-50 rounded-md border border-gray-200 space-y-2">
                                <div className="flex items-center gap-2">
                                    <input type="text" value={kr.text} onChange={e => handleKrChange(index, 'text', e.target.value)} placeholder={`KR ${index + 1}`} className="flex-grow p-2 border border-gray-300 rounded-md text-gray-800" />
                                    <button onClick={() => removeKr(index)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16} /></button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div><label className="text-xs text-gray-500">Inicial</label><input type="number" value={kr.startValue || ''} onChange={e => handleKrChange(index, 'startValue', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-gray-800" /></div>
                                    <div><label className="text-xs text-gray-500">Meta</label><input type="number" value={kr.targetValue || ''} onChange={e => handleKrChange(index, 'targetValue', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-gray-800" /></div>
                                    <div><label className="text-xs text-gray-500">Atual</label><p className="w-full p-2 border border-gray-200 bg-gray-100 rounded-md text-gray-800">{kr.currentValue || 0}</p></div>
                                    <div><label className="text-xs text-gray-500">Peso</label><input type="number" value={kr.weight || 1} onChange={e => handleKrChange(index, 'weight', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-gray-800" /></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button onClick={addKr} variant="secondary" className="mt-3 text-sm"><Plus size={16} /> Adicionar KR</Button>
                </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
                <Button onClick={onCancel} variant="secondary">Cancelar</Button>
                <Button onClick={handleFormSave} variant="primary">Salvar Objetivo</Button>
            </div>
        </Card>
    );
};

const KrItem = ({ kr, onUpdate }) => {
    const [isUpdating, setIsUpdating] = useState(false);
    const [newValue, setNewValue] = useState(kr.currentValue);
    const progress = calculateKrProgress(kr);

    const handleUpdate = () => {
        onUpdate(kr.id, newValue);
        setIsUpdating(false);
    };

    return (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium text-gray-800 flex-1">{kr.text}</p>
                <div className="flex items-center gap-4 mt-2 sm:mt-0">
                    <span className="text-xs text-gray-500">Peso: {kr.weight || 1}</span>
                    <div className="flex items-center gap-2">
                        {isUpdating ? (
                            <>
                                <input
                                    type="number"
                                    value={newValue}
                                    onChange={e => setNewValue(parseFloat(e.target.value))}
                                    className="w-24 p-1 border border-indigo-400 rounded-md"
                                    autoFocus
                                />
                                <Button onClick={handleUpdate} variant="primary" className="!px-2 !py-1"><Check size={16} /></Button>
                                <Button onClick={() => setIsUpdating(false)} variant="secondary" className="!px-2 !py-1"><X size={16} /></Button>
                            </>
                        ) : (
                            <>
                                <span className="font-semibold text-indigo-600 text-sm">{kr.currentValue}</span>
                                <span className="text-gray-500 text-sm">/ {kr.targetValue}</span>
                                <Button onClick={() => setIsUpdating(true)} variant="ghost" className="!p-1 h-7 w-7"><Zap size={16} /></Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
        </div>
    );
}

const OkrView = ({ okrs, onSave, onDelete }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingOkr, setEditingOkr] = useState(null);
    const [expandedOkrs, setExpandedOkrs] = useState({});

    const toggleExpansion = (okrId) => {
        setExpandedOkrs(prev => ({
            ...prev,
            [okrId]: !prev[okrId]
        }));
    };

    const handleSave = (okrData) => {
        onSave(okrData);
        setIsFormOpen(false);
        setEditingOkr(null);
    };
    
    const handleKrUpdate = (okr, krId, newValue) => {
        const updatedKeyResults = okr.keyResults.map(kr => {
            if (kr.id === krId) {
                const newUpdate = { value: newValue, date: new Date().toISOString() };
                return { ...kr, currentValue: newValue, updates: [...(kr.updates || []), newUpdate] };
            }
            return kr;
        });
        onSave({ ...okr, keyResults: updatedKeyResults });
    };

    const handleEdit = (okr) => {
        setEditingOkr(okr);
        setIsFormOpen(true);
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingOkr(null);
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-800 flex items-center"><Target className="mr-3 text-indigo-600" />Objetivos e Resultados-Chave</h2>
                        <p className="text-gray-600 mt-1">Defina e acompanhe as metas que impulsionam seu roadmap.</p>
                    </div>
                    {!isFormOpen && (
                        <Button onClick={() => setIsFormOpen(true)} variant="primary">
                            <Plus size={16} /> Novo Objetivo
                        </Button>
                    )}
                </div>
            </Card>

            {isFormOpen && <OkrForm key={editingOkr?.id || 'new'} okr={editingOkr} onSave={handleSave} onCancel={handleCancel} />}

            <div className="space-y-6">
                {okrs.map(okr => {
                    const progress = calculateOkrProgress(okr);
                    const isExpanded = !!expandedOkrs[okr.id];
                    return (
                        <Card key={okr.id} className="transition-all duration-300 overflow-hidden !p-0">
                            <div className="p-6">
                                <div className="flex justify-between items-start">
                                    <h3 className="text-xl font-bold text-gray-800 flex-1 pr-4">{okr.objective}</h3>
                                    <div className="flex space-x-2">
                                        <Button onClick={() => handleEdit(okr)} variant="ghost" className="!p-2"><Edit size={16} /></Button>
                                        <Button onClick={() => onDelete(okr.id, 'okr')} variant="ghost" className="!p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></Button>
                                    </div>
                                </div>
                                
                                <div className="mt-3 flex items-center gap-4 cursor-pointer" onClick={() => toggleExpansion(okr.id)}>
                                    <div className="w-full bg-gray-200 rounded-full h-4">
                                        <div className="bg-gradient-to-r from-sky-500 to-indigo-600 h-4 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <span className="text-lg font-bold text-indigo-600">{progress}%</span>
                                    <ChevronDown size={20} className={`text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                            </div>
                            
                            <div className={`transition-all duration-500 ease-in-out bg-gray-50/50 ${isExpanded ? 'max-h-[1000px] py-4' : 'max-h-0'}`}>
                                <div className="px-6 space-y-3">
                                    {okr.keyResults.map(kr => (
                                        <KrItem key={kr.id} kr={kr} onUpdate={(krId, newValue) => handleKrUpdate(okr, krId, newValue)} />
                                    ))}
                                </div>
                            </div>
                        </Card>
                    )
                })}
            </div>
        </div>
    );
};


// --- Componente Principal ---
export default function App() {
    const [userId, setUserId] = useState(null);
    const [appId] = useState('general-control');
    const [error, setError] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [okrs, setOkrs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('workspace'); // 'workspace', 'executive', 'okr'
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [filters, setFilters] = useState({ priority: 'Todos', status: 'Todos' });
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(5);
    const [viewStartDate, setViewStartDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() - 15);
        return date;
    });
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                signInAnonymously(auth).catch((authError) => {
                    console.error("Anonymous sign-in error:", authError);
                    setError("Falha na autenticação.");
                });
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
        }, (err) => { console.error("Error fetching tasks:", err); setError("Falha ao carregar tarefas."); });

        const unsubscribeOkrs = onSnapshot(query(collection(db, okrsCollectionPath)), (snapshot) => {
            setOkrs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => { console.error("Error fetching OKRs:", err); setError("Falha ao carregar OKRs."); });

        return () => { unsubscribeTasks(); unsubscribeOkrs(); };
    }, [userId, appId]);

    const handleSaveTask = async (taskData) => {
        const collectionPath = `artifacts/${appId}/public/data/roadmap_tasks`;
        if (taskData.id) {
            const { id, ...dataToUpdate } = taskData;
            await updateDoc(doc(db, collectionPath, id), dataToUpdate);
        } else {
            const newTask = { ...taskData, createdAt: serverTimestamp(), humanId: `${Math.random().toString(36).substring(2, 6).toUpperCase()}` };
            await addDoc(collection(db, collectionPath), newTask);
        }
    };

    const handleSaveOkr = async (okrData) => {
        const collectionPath = `artifacts/${appId}/public/data/okrs`;
        if (okrData.id) {
            const { id, ...dataToUpdate } = okrData;
            await updateDoc(doc(db, collectionPath, id), dataToUpdate);
        } else {
            const { id, ...dataToAdd } = okrData;
            await addDoc(collection(db, collectionPath), { ...dataToAdd, createdAt: serverTimestamp() });
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
        let sortedTasks = tasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        if (filters.priority !== 'Todos') sortedTasks = sortedTasks.filter(task => task.priority === filters.priority);
        if (filters.status !== 'Todos') sortedTasks = sortedTasks.filter(task => task.status === filters.status);
        return sortedTasks;
    }, [tasks, filters]);

    if (error) return <div className="bg-gray-50 text-red-500 min-h-screen flex items-center justify-center">{error}</div>;
    if (isLoading) return <div className="bg-gray-50 text-gray-800 min-h-screen flex items-center justify-center">Carregando Roadmap...</div>;

    return (
        <div className="bg-gray-50 text-gray-800 min-h-screen p-4 md:p-6 font-sans">
            <div className="max-w-full mx-auto">
                <header className="mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-600">Roadmap Ágil Interativo</h1>
                            <p className="text-gray-600 mt-1">Planeje, execute e apresente com clareza e foco.</p>
                        </div>
                        <div className="flex items-center bg-gray-200 rounded-lg p-1 space-x-1">
                            <Button onClick={() => setView('workspace')} variant={view === 'workspace' ? 'primary' : 'secondary'} className="!shadow-none"><Layers size={16} /> Workspace</Button>
                            <Button onClick={() => setView('okr')} variant={view === 'okr' ? 'primary' : 'secondary'} className="!shadow-none"><Target size={16} /> OKRs</Button>
                            <Button onClick={() => setView('executive')} variant={view === 'executive' ? 'primary' : 'secondary'} className="!shadow-none"><Briefcase size={16} /> Executive</Button>
                        </div>
                    </div>
                </header>
                <main>
                    {view === 'workspace' && (
                        <WorkspaceView
                            tasks={filteredTasks}
                            onTaskClick={handleOpenTaskModal}
                            filters={filters}
                            setFilters={setFilters}
                            zoomLevel={zoomLevel}
                            setZoomLevel={setZoomLevel}
                            viewStartDate={viewStartDate}
                            setViewStartDate={setViewStartDate}
                            onOpenTaskModal={handleOpenTaskModal}
                        />
                    )}
                    {view === 'okr' && (
                        <OkrView 
                            okrs={okrs}
                            onSave={handleSaveOkr}
                            onDelete={requestDelete}
                        />
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
