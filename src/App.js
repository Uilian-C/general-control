import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, serverTimestamp } from 'firebase/firestore';
import { Target, Layers, Briefcase, Edit, Plus, Trash2, X, Settings, Tag, Palette, TrendingUp, Download, Calendar, ListTodo, ZoomIn, ZoomOut, ChevronsUpDown, CheckCircle, MoreVertical, History, Check, Zap, ChevronDown, LayoutGrid, List, AlertTriangle, Clock, TrendingUp as TrendingUpIcon, Lock, Unlock, Gauge, LogOut, User,LogIn, ArrowRight, Repeat, Presentation } from 'lucide-react';

// --- ATENÇÃO: Para a funcionalidade de exportar PDF funcionar ---
// Adicione estas duas linhas no <head> do seu arquivo HTML principal (ex: index.html)
// <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
// <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

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
  'Alta': { label: 'Alta', color: 'bg-red-500', textColor: 'text-red-500', borderColor: 'border-red-500' },
  'Média': { label: 'Média', color: 'bg-yellow-500', textColor: 'text-yellow-500', borderColor: 'border-yellow-500' },
  'Baixa': { label: 'Baixa', color: 'bg-blue-500', textColor: 'text-blue-500', borderColor: 'border-blue-500' },
};
const STATUSES = {
  'A Fazer': { label: 'A Fazer', color: 'bg-gray-200 text-gray-800', borderColor: 'border-gray-400' },
  'Em Progresso': { label: 'Em Progresso', color: 'bg-indigo-200 text-indigo-800', borderColor: 'border-indigo-400' },
  'Concluído': { label: 'Concluído', color: 'bg-green-200 text-green-800', borderColor: 'border-green-500' },
  'Bloqueado': { label: 'Bloqueado', color: 'bg-red-200 text-red-800', borderColor: 'border-red-500' },
};
const TASK_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6', '#a3a3a3'];
const CYCLE_COLORS = ['#fecaca', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8'];

const formatDate = (dateInput, includeTime = false) => {
  if (!dateInput) return '';
  const date = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
  const options = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
};

const parseLocalDate = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString + 'T00:00:00');
}

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

// --- Lógica de Cálculo de Progresso e Ritmo ---
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

const calculatePacingInfo = (startDate, targetDate, startValue, targetValue, currentValue) => {
    if (!startDate || !targetDate) {
        return { daysRemaining: null, requiredPace: null, status: 'no-date' };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = parseLocalDate(targetDate);
    
    const progress = calculateKrProgress({ startValue, targetValue, currentValue });
    if (progress >= 100) {
        return { daysRemaining: null, requiredPace: null, status: 'completed' };
    }
    
    if (target < today) {
        return { daysRemaining: 0, requiredPace: null, status: 'overdue' };
    }

    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const monthsRemaining = Math.max(1, (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44)); 
    const remainingValue = (Number(targetValue) || 0) - (Number(currentValue) || 0);
    
    if (remainingValue <= 0) {
         return { daysRemaining, requiredPace: 0, status: 'completed' };
    }

    const requiredPace = (remainingValue / monthsRemaining);
    return { daysRemaining, requiredPace: requiredPace.toFixed(1), status: 'on-track' };
};

const calculateOkrStatus = (startDate, targetDate, currentProgress) => {
    if (!startDate || !targetDate) return { status: 'no-date', text: 'Sem data alvo', color: 'bg-gray-400' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = parseLocalDate(startDate);
    const target = parseLocalDate(targetDate);

    if (currentProgress >= 100) return { status: 'completed', text: 'Concluído', color: 'bg-green-500' };
    if (target < today) return { status: 'overdue', text: 'Atrasado', color: 'bg-red-500' };
    if (today < start) return { status: 'not-started', text: 'Não iniciado', color: 'bg-gray-400' };
    
    const totalDuration = target.getTime() - start.getTime();
    if (totalDuration <= 0) return { status: 'completed', text: 'Concluído', color: 'bg-green-500' };

    const elapsedDuration = today.getTime() - start.getTime();
    const expectedProgress = Math.round((elapsedDuration / totalDuration) * 100);

    const difference = currentProgress - expectedProgress;

    if (difference < -15) return { status: 'behind', text: 'Em Risco', color: 'bg-yellow-500' };
    if (difference > 15) return { status: 'ahead', text: 'Adiantado', color: 'bg-sky-500' };
    return { status: 'on-track', text: 'No Ritmo', color: 'bg-green-500' };
};

const calculateTaskProgress = (task) => {
    if (task.status === 'Concluído') return 100;
    if (!task.subtasks || task.subtasks.length === 0) {
        return task.status === 'Em Progresso' ? 50 : 0;
    }
    const completedSubtasks = task.subtasks.filter(s => s.completed).length;
    return Math.round((completedSubtasks / task.subtasks.length) * 100);
};

const getTaskDurationInDays = (task) => {
    if (!task.startDate || !task.endDate) return 1;
    const start = parseLocalDate(task.startDate);
    const end = parseLocalDate(task.endDate);
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(1, duration + 1);
};

// --- Componentes da UI ---
const Card = ({ children, className = '', ...props }) => (
    <div className={`bg-white border border-gray-200 rounded-xl p-6 shadow-sm ${className}`} {...props}>
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
        <button type="button" onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled}>
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

const CyclesModal = ({ isOpen, onClose, cycles, onSave, onDelete }) => {
    const [localCycles, setLocalCycles] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setLocalCycles(cycles.map(c => ({...c, localId: c.id || `new_${Date.now()}_${Math.random()}`})));
        }
    }, [isOpen, cycles]);

    const handleCycleChange = (index, field, value) => {
        const updatedCycles = [...localCycles];
        updatedCycles[index][field] = value;
        setLocalCycles(updatedCycles);
    };

    const addCycle = () => {
        const today = new Date().toISOString().split('T')[0];
        setLocalCycles([...localCycles, {
            localId: `new_${Date.now()}_${Math.random()}`,
            name: '',
            startDate: today,
            endDate: today,
            color: CYCLE_COLORS[localCycles.length % CYCLE_COLORS.length]
        }]);
    };

    const removeCycle = (cycleToRemove) => {
        if (cycleToRemove.id) {
            onDelete(cycleToRemove.id);
        }
        setLocalCycles(localCycles.filter(c => c.localId !== cycleToRemove.localId));
    };

    const handleSaveAll = () => {
        const cyclesToSave = localCycles.filter(c => c.name.trim() !== '');
        onSave(cyclesToSave);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gerenciar Ciclos de Trabalho" size="2xl">
            <div className="space-y-4">
                <p className="text-gray-600">Crie e gerencie os ciclos (Sprints, PIs, Trimestres) que aparecerão como fundo no seu Roadmap.</p>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {localCycles.map((cycle, index) => (
                        <div key={cycle.localId} className="p-4 bg-gray-50 rounded-lg border flex flex-col md:flex-row gap-4 items-center">
                            <input
                                type="text"
                                placeholder="Nome do Ciclo (Ex: Sprint 1)"
                                value={cycle.name}
                                onChange={(e) => handleCycleChange(index, 'name', e.target.value)}
                                className="w-full p-2 border rounded-md"
                            />
                            <input
                                type="date"
                                value={cycle.startDate}
                                onChange={(e) => handleCycleChange(index, 'startDate', e.target.value)}
                                className="p-2 border rounded-md"
                            />
                            <input
                                type="date"
                                value={cycle.endDate}
                                onChange={(e) => handleCycleChange(index, 'endDate', e.target.value)}
                                className="p-2 border rounded-md"
                            />
                            <input
                                type="color"
                                value={cycle.color}
                                onChange={(e) => handleCycleChange(index, 'color', e.target.value)}
                                className="p-1 h-10 w-12 border rounded-md cursor-pointer"
                            />
                            <Button onClick={() => removeCycle(cycle)} variant="ghost" className="text-red-500"><Trash2 size={16} /></Button>
                        </div>
                    ))}
                </div>
                <Button onClick={addCycle} variant="secondary"><Plus size={16} /> Adicionar Ciclo</Button>
            </div>
            <footer className="flex justify-end space-x-4 pt-4 mt-4 border-t">
                <Button onClick={onClose} variant="secondary">Cancelar</Button>
                <Button onClick={handleSaveAll} variant="primary">Salvar Ciclos</Button>
            </footer>
        </Modal>
    );
};

const TaskModal = ({ isOpen, onClose, task, tasks, okrs, onSave, onDeleteRequest }) => {
    const getInitialFormState = () => {
        const today = new Date().toISOString().split('T')[0];
        if (task) {
            return {
                title: task.title || '',
                description: task.description || '',
                priority: task.priority || 'Média',
                status: task.status || 'A Fazer',
                startDate: task.startDate || today,
                endDate: task.endDate || today,
                labels: task.labels || [],
                projectTag: task.projectTag || '',
                blockerLog: task.blockerLog || [],
                subtasks: task.subtasks || [],
                customColor: task.customColor || '',
                okrLinkValue: `${task.okrLink?.okrId || ''}|${task.okrLink?.krId || ''}`
            };
        }
        return {
            title: '', description: '', priority: 'Média', status: 'A Fazer',
            startDate: today, endDate: today, labels: [], projectTag: '',
            blockerLog: [], subtasks: [], customColor: '', okrLinkValue: '|'
        };
    };

    const [formState, setFormState] = useState(getInitialFormState());
    const [newProject, setNewProject] = useState('');
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [expandedBlocker, setExpandedBlocker] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setFormState(getInitialFormState());
        }
    }, [task, isOpen]);

    const displayProjectList = useMemo(() => {
        const projects = new Set(tasks.map(t => t.projectTag).filter(Boolean));
        if (formState.projectTag && !projects.has(formState.projectTag)) {
            projects.add(formState.projectTag);
        }
        return Array.from(projects).sort();
    }, [tasks, formState.projectTag]);

    const allLabels = useMemo(() => {
        const labelSet = new Set();
        tasks.forEach(t => (t.labels || []).forEach(label => labelSet.add(label)));
        return Array.from(labelSet).sort();
    }, [tasks]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormState(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    
    const handleLabelsChange = (e) => {
        const labels = e.target.value.split(',').map(l => l.trim()).filter(Boolean);
        setFormState(prev => ({ ...prev, labels }));
    };
    
    const handleLabelClick = (label) => {
        const currentLabels = formState.labels || [];
        const newLabels = currentLabels.includes(label)
            ? currentLabels.filter(l => l !== label)
            : [...currentLabels, label];
        setFormState(prev => ({ ...prev, labels: newLabels }));
    };

    const handleProjectChange = (e) => {
        const { value } = e.target;
        if (value === '_new_') {
            setIsCreatingProject(true);
            setFormState(prev => ({ ...prev, projectTag: '' }));
        } else {
            setIsCreatingProject(false);
            setNewProject('');
            setFormState(prev => ({ ...prev, projectTag: value }));
        }
    };

    const handleNewProjectCreate = () => {
        if (newProject.trim()) {
            setFormState(prev => ({ ...prev, projectTag: newProject.trim() }));
            setIsCreatingProject(false);
            setNewProject('');
        }
    };
    
    const addBlocker = () => {
        const newLog = [...(formState.blockerLog || []), {
            id: `block_${Date.now()}`,
            blockDate: new Date().toISOString().split('T')[0],
            blockReason: '',
            unblockDate: null,
            unblockReason: ''
        }];
        setFormState(prev => ({ ...prev, blockerLog: newLog, status: 'Bloqueado' }));
    };
    
    const handleBlockerLogChange = (logId, field, value) => {
        const newLog = (formState.blockerLog || []).map(b => 
            b.id === logId ? { ...b, [field]: value } : b
        );
        setFormState(prev => ({ ...prev, blockerLog: newLog }));
    };
    
    const handleUnblock = (logId) => {
        const newLog = (formState.blockerLog || []).map(b => 
            b.id === logId ? { ...b, unblockDate: new Date().toISOString().split('T')[0] } : b
        );
        const isStillBlocked = newLog.some(b => !b.unblockDate);
        setFormState(prev => ({ ...prev, blockerLog: newLog, status: isStillBlocked ? 'Bloqueado' : 'A Fazer' }));
    };
    
    const handleSubtaskChange = (index, field, value) => {
        const newSubtasks = [...(formState.subtasks || [])];
        newSubtasks[index] = { ...newSubtasks[index], [field]: value };
        setFormState(prev => ({ ...prev, subtasks: newSubtasks }));
    };

    const addSubtask = () => {
        const newSubtask = { id: `sub_${Date.now()}`, text: '', completed: false, targetDate: '' };
        setFormState(prev => ({ ...prev, subtasks: [...(prev.subtasks || []), newSubtask] }));
    };

    const removeSubtask = (index) => {
        const newSubtasks = (formState.subtasks || []).filter((_, i) => i !== index);
        setFormState(prev => ({ ...prev, subtasks: newSubtasks }));
    };
    
    const handleColorChange = (color) => {
        setFormState(prev => ({...prev, customColor: color}));
    };

    const handleSave = () => {
        const { okrLinkValue, ...restOfForm } = formState;
        const [okrId, krId] = (okrLinkValue || '|').split('|');
        
        const taskToSave = {
            id: task?.id,
            ...restOfForm,
            okrLink: { okrId: okrId || '', krId: krId || '' }
        };
        onSave(taskToSave);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={task?.humanId ? `Editar Tarefa [${task.humanId}]` : "Nova Tarefa"} size="4xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                    <input type="text" name="title" value={formState.title} onChange={handleChange} placeholder="Título da Tarefa" className="w-full p-2 bg-transparent text-2xl font-bold border-b-2 border-gray-200 focus:border-indigo-500 focus:outline-none" />
                    <textarea name="description" value={formState.description} onChange={handleChange} placeholder="Adicione uma descrição..." className="w-full p-2 bg-gray-50 rounded-md h-32 border border-gray-200 focus:border-indigo-500 focus:outline-none"></textarea>
                    
                    <div>
                        <h3 className="font-semibold mb-2">Subtarefas</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                             {(formState.subtasks || []).map((sub, index) => (
                                <div key={sub.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-md">
                                    <input type="checkbox" checked={sub.completed} onChange={(e) => handleSubtaskChange(index, 'completed', e.target.checked)} className="h-5 w-5 rounded text-indigo-600" />
                                    <input type="text" value={sub.text} onChange={(e) => handleSubtaskChange(index, 'text', e.target.value)} className={`flex-grow p-1 bg-transparent border-b ${sub.completed ? 'line-through text-gray-500' : ''}`} placeholder="Descrição da subtarefa"/>
                                    <input type="date" value={sub.targetDate || ''} onChange={(e) => handleSubtaskChange(index, 'targetDate', e.target.value)} className="p-1 text-sm border rounded-md" />
                                    <button onClick={() => removeSubtask(index)}><Trash2 size={16} className="text-red-400 hover:text-red-600" /></button>
                                </div>
                            ))}
                        </div>
                         <Button onClick={addSubtask} variant="secondary" className="mt-2 text-sm">Adicionar Subtarefa</Button>
                    </div>
                    
                    <div>
                        <h3 className="font-semibold mb-2">Histórico de Bloqueios</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                            {(formState.blockerLog || []).map(log => (
                                <div key={log.id} className="p-3 bg-gray-50 rounded-md border border-gray-200" >
                                    <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedBlocker(expandedBlocker === log.id ? null : log.id)}>
                                        <p className={`font-semibold ${log.unblockDate ? 'text-green-600' : 'text-red-600'}`}>{log.unblockDate ? 'Desbloqueado' : 'Bloqueado'} em {formatDate(log.blockDate, false)}</p>
                                        <ChevronDown size={16} className={`transition-transform ${expandedBlocker === log.id ? 'rotate-180' : ''}`} />
                                    </div>
                                    {expandedBlocker === log.id && (
                                        <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                                            <div>
                                                <label className="text-xs font-medium text-gray-500">Motivo do Bloqueio</label>
                                                <textarea value={log.blockReason} onChange={e => handleBlockerLogChange(log.id, 'blockReason', e.target.value)} className="w-full p-1 border rounded-md text-sm h-16"></textarea>
                                            </div>
                                            {!log.unblockDate ? (
                                                <Button onClick={() => handleUnblock(log.id)} variant="secondary" className="!text-xs !py-1 w-full">Registrar Desbloqueio</Button>
                                            ) : (
                                                <div>
                                                     <label className="text-xs font-medium text-gray-500">Data do Desbloqueio: {formatDate(log.unblockDate, false)}</label>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <Button onClick={addBlocker} variant="secondary" className="mt-2 text-sm">Adicionar Bloqueio</Button>
                    </div>
                </div>
                <div className="md:col-span-1 space-y-4 bg-gray-50 p-4 rounded-lg">
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600">Status</label>
                        <select name="status" value={formState.status} onChange={handleChange} disabled={(formState.blockerLog || []).some(b => !b.unblockDate)} className="w-full p-2 border border-gray-300 rounded-md">
                            {Object.keys(STATUSES).map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}
                        </select>
                    </div>
                     <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600">Datas</label>
                        <div className="space-y-2">
                            <input type="date" name="startDate" value={formState.startDate} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md" />
                            <input type="date" name="endDate" value={formState.endDate} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600">Prioridade</label>
                        <select name="priority" value={formState.priority} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md">
                            {Object.keys(PRIORITIES).map(p => <option key={p} value={p}>{PRIORITIES[p].label}</option>)}
                        </select>
                    </div>
                     <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600">Projeto</label>
                        {!isCreatingProject ? (
                            <select name="projectTag" value={formState.projectTag} onChange={handleProjectChange} className="w-full p-2 border border-gray-300 rounded-md">
                                <option value="">Nenhum</option>
                                {displayProjectList.map(p => <option key={p} value={p}>{p}</option>)}
                                <option value="_new_">-- Criar Novo Projeto --</option>
                            </select>
                        ) : (
                            <div className="flex gap-2">
                                <input type="text" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="Nome do novo projeto" className="w-full p-2 border border-gray-300 rounded-md" />
                                <Button onClick={handleNewProjectCreate}><Check size={16} /></Button>
                            </div>
                        )}
                    </div>
                     <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600">Etiquetas</label>
                        <input type="text" value={(formState.labels || []).join(', ')} onChange={handleLabelsChange} className="w-full p-2 border border-gray-300 rounded-md" placeholder="Ex: UX, Backend, Marketing" />
                        <div className="flex flex-wrap gap-2 mt-2">
                            {allLabels.map(label => (
                                <button key={label} onClick={() => handleLabelClick(label)} className={`px-2 py-1 text-xs rounded-full ${ (formState.labels || []).includes(label) ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>{label}</button>
                            ))}
                        </div>
                    </div>
                     <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600">Vincular ao OKR</label>
                        <select name="okrLinkValue" value={formState.okrLinkValue} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md">
                            <option value="|">Nenhum</option>
                            {okrs.map(okr => (
                                <optgroup key={okr.id} label={okr.objective}>
                                    <option key={`${okr.id}_general`} value={`${okr.id}|`}>-- Objetivo Geral --</option>
                                    {(okr.keyResults || []).map(kr => <option key={`${okr.id}|${kr.id}`} value={`${okr.id}|${kr.id}`}>{kr.text}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-600">Cor</label>
                        <div className="flex gap-2">
                             {TASK_COLORS.map(color => (
                                <button key={color} onClick={() => handleColorChange(color)} className="w-6 h-6 rounded-full transition-transform hover:scale-110" style={{backgroundColor: color}}>
                                    {formState.customColor === color && <Check size={16} className="text-white m-auto"/>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="md:col-span-3 flex justify-between items-center pt-6 border-t">
                    <div>{task && <Button onClick={() => onDeleteRequest(task.id, 'task')} variant="danger"><Trash2 size={16} /> Excluir</Button>}</div>
                    <div className="flex gap-4">
                        <Button onClick={onClose} variant="secondary">Cancelar</Button>
                        <Button onClick={handleSave}>Salvar Tarefa</Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};


// --- COMPONENTE TIMELINE ---
const Timeline = ({ tasks, cycles, onTaskClick, zoomLevel, viewStartDate }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timelineRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    
    const dayWidth = useMemo(() => 8 + (zoomLevel * 2.5), [zoomLevel]);
    
    const { days, timelineWidth, headerGroups, subHeaderGroups } = useMemo(() => {
        let maxEndDate = null;
        const allDates = [...tasks, ...cycles].map(item => parseLocalDate(item.endDate));
        if (allDates.length > 0) {
            const validEndDates = allDates.filter(date => date && !isNaN(date.getTime()));
            if (validEndDates.length > 0) {
                maxEndDate = new Date(Math.max.apply(null, validEndDates));
            }
        }

        const defaultEndDate = new Date(viewStartDate);
        defaultEndDate.setDate(defaultEndDate.getDate() + 90);

        let timelineEndDate = defaultEndDate;
        if (maxEndDate && maxEndDate > defaultEndDate) {
            timelineEndDate = new Date(maxEndDate);
        }
        
        timelineEndDate.setDate(timelineEndDate.getDate() + 30);

        const days = getDaysInView(viewStartDate, timelineEndDate);
        const timelineWidth = days.length * dayWidth;
        
        const primaryGroups = [];
        const secondaryGroups = [];
        
        if (days.length > 0) {
            let currentPrimaryGroup = null;
            let currentSecondaryGroup = null;

            if (zoomLevel <= 3) {
                days.forEach(day => {
                    const year = day.getFullYear();
                    const quarter = Math.floor(day.getMonth() / 3) + 1;
                    const quarterKey = `${year}-Q${quarter}`;
                    if (!currentPrimaryGroup || currentPrimaryGroup.key !== quarterKey) {
                        currentPrimaryGroup = { key: quarterKey, label: `T${quarter} ${year}`, width: 0 };
                        primaryGroups.push(currentPrimaryGroup);
                    }
                    currentPrimaryGroup.width += dayWidth;
                    const monthKey = `${year}-${day.getMonth()}`;
                    if(!currentSecondaryGroup || currentSecondaryGroup.key !== monthKey) {
                        currentSecondaryGroup = { key: monthKey, label: new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(day), width: 0 };
                        secondaryGroups.push(currentSecondaryGroup);
                    }
                    currentSecondaryGroup.width += dayWidth;
                });
            } 
            else if (zoomLevel <= 7) {
                days.forEach(day => {
                    const monthKey = `${day.getFullYear()}-${day.getMonth()}`;
                    if (!currentPrimaryGroup || currentPrimaryGroup.key !== monthKey) {
                        currentPrimaryGroup = { key: monthKey, label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(day), width: 0 };
                        primaryGroups.push(currentPrimaryGroup);
                    }
                    currentPrimaryGroup.width += dayWidth;
                    secondaryGroups.push({ key: day.toISOString(), label: day.getDate(), width: dayWidth, isToday: day.toDateString() === today.toDateString() });
                });
            }
            else {
                 days.forEach(day => {
                    const weekNumber = Math.ceil((((day - new Date(day.getFullYear(), 0, 1)) / 86400000) + new Date(day.getFullYear(), 0, 1).getDay() + 1) / 7);
                    const weekKey = `${day.getFullYear()}-W${weekNumber}`;
                     if (!currentPrimaryGroup || currentPrimaryGroup.key !== weekKey) {
                        currentPrimaryGroup = { key: weekKey, label: `Semana ${weekNumber}`, width: 0 };
                        primaryGroups.push(currentPrimaryGroup);
                     }
                     currentPrimaryGroup.width += dayWidth;
                    secondaryGroups.push({ key: day.toISOString(), label: day.getDate(), subLabel: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(day).slice(0, 3), width: dayWidth, isToday: day.toDateString() === today.toDateString() });
                });
            }
        }
        
        return { days, timelineWidth, headerGroups: primaryGroups, subHeaderGroups: secondaryGroups };
    }, [viewStartDate, zoomLevel, tasks, cycles]);

    const onMouseDown = (e) => {
        if (!timelineRef.current || e.target.closest('.task-bar')) return;
        setIsDragging(true);
        setStartX(e.pageX - timelineRef.current.offsetLeft);
        setScrollLeft(timelineRef.current.scrollLeft);
        timelineRef.current.style.cursor = 'grabbing';
    };

    const onMouseLeaveOrUp = () => {
        if (!timelineRef.current) return;
        setIsDragging(false);
        timelineRef.current.style.cursor = 'grab';
    };

    const onMouseMove = (e) => {
        if (!isDragging || !timelineRef.current) return;
        e.preventDefault();
        const x = e.pageX - timelineRef.current.offsetLeft;
        const walk = (x - startX);
        timelineRef.current.scrollLeft = scrollLeft - walk;
    };

    const groupedTasks = useMemo(() => {
        return tasks.reduce((acc, task) => {
            const group = task.projectTag || 'Sem Projeto';
            if (!acc[group]) acc[group] = [];
            acc[group].push(task);
            return acc;
        }, {});
    }, [tasks]);

    const [collapsedGroups, setCollapsedGroups] = useState({});
    const toggleGroup = (group) => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));

    return (
        <div className="relative bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="overflow-x-auto cursor-grab" ref={timelineRef} onMouseDown={onMouseDown} onMouseLeave={onMouseLeaveOrUp} onMouseUp={onMouseLeaveOrUp} onMouseMove={onMouseMove}>
                <div style={{ width: timelineWidth }} className="relative">
                    <div className="sticky top-0 z-30 bg-gray-100/80 backdrop-blur-sm h-16">
                        <div className="flex border-b border-gray-300 h-8">
                             {headerGroups.map((group) => (<div key={group.key} className="flex-shrink-0 text-center font-bold text-gray-700 border-r border-gray-300 flex items-center justify-center" style={{ width: group.width }}><span className="whitespace-nowrap px-2">{group.label}</span></div>))}
                        </div>
                        <div className="flex border-b-2 border-gray-300 h-8">
                             {subHeaderGroups.map((group) => (<div key={group.key} className={`flex-shrink-0 text-center font-semibold border-r border-gray-200 flex flex-col justify-center items-center ${group.isToday ? 'bg-indigo-100' : ''}`} style={{ width: group.width }}><span className={`text-xs ${group.isToday ? 'text-indigo-600' : 'text-gray-500'}`}>{group.subLabel}</span><span className={`whitespace-nowrap text-sm ${group.isToday ? 'text-indigo-600 font-bold' : 'text-gray-600'}`}>{group.label}</span></div>))}
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute top-0 left-0 w-full h-full z-0">
                            <div className="flex h-full">{days.map((day, index) => (<div key={index} className={`h-full border-r ${day.getUTCDay() === 0 || day.getUTCDay() === 6 ? 'bg-gray-50/50' : 'border-gray-100'}`} style={{ width: dayWidth }}></div>))}</div>
                            {cycles.map(cycle => {
                                const cycleStart = parseLocalDate(cycle.startDate);
                                const cycleEnd = parseLocalDate(cycle.endDate);
                                if (!cycleStart || !cycleEnd || cycleEnd < viewStartDate || cycleStart > new Date(viewStartDate).setDate(viewStartDate.getDate() + days.length)) return null;
                                const startOffset = Math.round((cycleStart.getTime() - viewStartDate.getTime()) / (1000 * 60 * 60 * 24));
                                const duration = Math.max(1, ((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                                return (
                                    <div key={cycle.id} className="absolute top-0 bottom-0" style={{ left: `${startOffset * dayWidth}px`, width: `${duration * dayWidth}px` }}>
                                        <div className="h-full w-full border-x" style={{ backgroundColor: cycle.color, opacity: 0.15, borderColor: cycle.color }}></div>
                                    </div>
                                )
                            })}
                        </div>
                        
                        <div className="relative z-10 h-8 border-b border-gray-200">
                             {cycles.map(cycle => {
                                 const cycleStart = parseLocalDate(cycle.startDate);
                                 const cycleEnd = parseLocalDate(cycle.endDate);
                                 if (!cycleStart || !cycleEnd || cycleEnd < viewStartDate || cycleStart > new Date(viewStartDate).setDate(viewStartDate.getDate() + days.length)) return null;
                                 const startOffset = Math.round((cycleStart.getTime() - viewStartDate.getTime()) / (1000 * 60 * 60 * 24));
                                 const duration = Math.max(1, ((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                                 return (
                                     <div key={cycle.id} className="absolute top-0 flex items-center h-full" style={{ left: `${startOffset * dayWidth}px`, width: `${duration * dayWidth}px` }}>
                                         <div className="w-full font-bold text-center text-sm text-gray-700 p-1 truncate">
                                             {cycle.name}
                                         </div>
                                     </div>
                                 )
                             })}
                        </div>

                        <div className="relative z-20">
                            {Object.keys(groupedTasks).sort().map((group) => {
                                const isCollapsed = collapsedGroups[group];
                                return (
                                    <div key={group}>
                                        <div className="sticky top-[96px] z-20 flex items-center h-10 bg-white/80 backdrop-blur-sm border-b border-t border-gray-200 -ml-px" onClick={() => toggleGroup(group)}>
                                            <div className="flex items-center gap-2 p-2 cursor-pointer"><ChevronsUpDown size={16} className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`} /><h3 className="font-bold text-gray-800">{group}</h3></div>
                                        </div>
                                        {!isCollapsed && (
                                            <div className="relative" style={{ height: groupedTasks[group].length * 48 + 10 }}>
                                                {groupedTasks[group].map((task, taskIndex) => {
                                                    const taskStart = parseLocalDate(task.startDate);
                                                    const taskEnd = parseLocalDate(task.endDate);
                                                    if (!taskStart || !taskEnd || taskEnd < viewStartDate || taskStart > new Date(viewStartDate).setDate(viewStartDate.getDate() + days.length)) return null;
                                                    
                                                    const startOffset = (taskStart.getTime() - viewStartDate.getTime()) / (1000 * 60 * 60 * 24); const duration = Math.max(1, (taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24) + 1); const left = startOffset * dayWidth; const width = duration * dayWidth - 4;
                                                    const progress = calculateTaskProgress(task);
                                                    const daysRemaining = Math.ceil((taskEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                                    
                                                    return (
                                                        <div key={task.id} id={`task-${task.id}`} className="h-10 absolute flex items-center rounded-lg cursor-pointer transition-all duration-200 group task-bar" style={{ top: `${taskIndex * 48 + 5}px`, left: `${left}px`, width: `${width}px` }} onClick={() => onTaskClick(task)} title={`${task.title} - ${task.status} (${Math.round(progress)}%)`}>
                                                            <div 
                                                                className={`h-full w-full rounded-lg flex items-center overflow-hidden relative shadow-md group-hover:shadow-lg group-hover:scale-[1.02] transition-all duration-200`}
                                                                style={{ 
                                                                    backgroundColor: task.blockerLog?.some(b => !b.unblockDate) 
                                                                        ? '#f87171'
                                                                        : task.customColor || '#9ca3af'
                                                                }}
                                                            >
                                                                <div className="absolute top-0 left-0 h-full bg-black/20" style={{ width: `${progress}%` }}></div>
                                                                <div className="relative z-10 flex items-center justify-between w-full px-2">
                                                                    <div className="flex items-center gap-2">
                                                                        {task.blockerLog?.some(b => !b.unblockDate) && <Lock size={12} className="text-white flex-shrink-0" />}
                                                                        <p className="text-sm font-semibold text-white truncate">{task.title}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                                        {width > 120 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUSES[task.status]?.color} bg-opacity-70 backdrop-blur-sm`}>{STATUSES[task.status]?.label}</span>}
                                                                        {width > 80 && <span className="text-xs text-white font-semibold bg-black/20 px-1.5 py-0.5 rounded-full">{progress}%</span>}
                                                                        {daysRemaining > 0 && task.status !== 'Concluído' && width > 100 && (
                                                                            <span className="text-xs text-white bg-black/20 px-1.5 py-0.5 rounded-full">{daysRemaining}d</span>
                                                                        )}
                                                                    </div>
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
        </div>
    );
};


const FilterList = ({ title, options, active, onFilterChange }) => (
    <div className="flex items-center gap-2">
        <label htmlFor={`filter-${title}`} className="text-sm font-medium text-gray-600">{title}:</label>
        <select
            id={`filter-${title}`}
            value={active}
            onChange={(e) => onFilterChange(e.target.value)}
            className="p-2 border border-gray-300 rounded-md bg-white shadow-sm focus:ring-indigo-500 focus:border-indigo-500 min-w-[150px]"
        >
            <option value="Todos">Todos</option>
            {Object.keys(options).map(key => (
                <option key={key} value={key}>{options[key].label}</option>
            ))}
        </select>
    </div>
);

const WorkspaceView = ({ tasks, cycles, onTaskClick, filters, setFilters, zoomLevel, setZoomLevel, viewStartDate, setViewStartDate, onOpenTaskModal, onOpenCyclesModal }) => {
    const allLabels = useMemo(() => {
        const labelSet = new Set();
        tasks.forEach(task => (task.labels || []).forEach(label => labelSet.add(label)));
        const labelOptions = {};
        Array.from(labelSet).sort().forEach(label => {
            labelOptions[label] = { label };
        });
        return labelOptions;
    }, [tasks]);

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                         <div className="flex items-center gap-2">
                            <Button onClick={() => setViewStartDate(new Date(new Date().setDate(new Date().getDate() - 15)))} variant="secondary">Hoje</Button>
                            <Button onClick={onOpenCyclesModal} variant="secondary"><Repeat size={16} className="mr-2"/> Gerenciar Ciclos</Button>
                         </div>
                         <div className="flex items-center gap-2">
                            <button onClick={() => setZoomLevel(z => Math.max(1, z - 1))} className="p-2 rounded-full hover:bg-gray-200 transition-colors"><ZoomOut size={20} /></button>
                            <input type="range" min="1" max="10" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} className="w-24" />
                            <button onClick={() => setZoomLevel(z => Math.min(10, z + 1))} className="p-2 rounded-full hover:bg-gray-200 transition-colors"><ZoomIn size={20} /></button>
                         </div>
                    </div>
                     <div className="flex flex-wrap justify-start items-center gap-4 border-t pt-4 mt-2">
                        <FilterList title="Prioridade" options={PRIORITIES} active={filters.priority} onFilterChange={val => setFilters({...filters, priority: val})}/>
                        <FilterList title="Status" options={STATUSES} active={filters.status} onFilterChange={val => setFilters({...filters, status: val})}/>
                        {Object.keys(allLabels).length > 0 && (
                             <FilterList title="Etiqueta" options={allLabels} active={filters.label} onFilterChange={val => setFilters({...filters, label: val})}/>
                        )}
                    </div>
                </div>
            </Card>
            <Timeline tasks={tasks} cycles={cycles} onTaskClick={onTaskClick} zoomLevel={zoomLevel} viewStartDate={viewStartDate} />
            <div className="mt-6 flex justify-end gap-4">
                <Button onClick={() => onOpenTaskModal()} variant="primary"><Plus size={20} className="mr-2" /> Nova Tarefa</Button>
            </div>
        </div>
    );
};

// --- VISÃO EXECUTIVA ---
const ExecutiveView = ({ tasks, okrs, onSaveOkr }) => {
    const executiveViewRef = useRef(null);
    const [nextStepsPriority, setNextStepsPriority] = useState('Alta');

    const {
        overallRoadmapProgress,
        overallOkrProgress,
        projectStatusSummary,
        projectProgressSummary, 
        okrsWithProgress,
        attentionPoints,
        nextSteps
    } = useMemo(() => {
        const today = new Date();
        
        const roadmapMetrics = tasks.reduce((acc, task) => {
            const duration = getTaskDurationInDays(task);
            const progress = calculateTaskProgress(task);
            acc.totalDuration += duration;
            acc.totalWeightedProgress += progress * duration;
            return acc;
        }, { totalDuration: 0, totalWeightedProgress: 0 });

        const overallProgress = roadmapMetrics.totalDuration > 0
            ? Math.round(roadmapMetrics.totalWeightedProgress / roadmapMetrics.totalDuration)
            : 0;
            
        const projects = tasks.reduce((acc, task) => {
            const tag = task.projectTag || 'Sem Projeto';
            if (!acc[tag]) acc[tag] = { tasks: [] };
            acc[tag].tasks.push(task);
            return acc;
        }, {});
        
        const statusSummary = Object.keys(projects).map(tag => {
            const projectTasks = projects[tag].tasks;
            const statusCounts = projectTasks.reduce((counts, task) => {
                counts[task.status] = (counts[task.status] || 0) + 1;
                return counts;
            }, {});
            return { name: tag, tasksCount: projectTasks.length, ...statusCounts };
        });

        const progressSummary = Object.keys(projects).map(tag => {
            const projectTasks = projects[tag].tasks;
            if (projectTasks.length === 0) return { name: tag, progress: 0 };
            const totalProgress = projectTasks.reduce((sum, task) => sum + calculateTaskProgress(task), 0);
            return { name: tag, progress: Math.round(totalProgress / projectTasks.length) };
        }).sort((a,b) => a.progress - b.progress);

        const okrsDetails = okrs.map(okr => {
            const progress = calculateOkrProgress(okr);
            const status = calculateOkrStatus(okr.startDate, okr.targetDate, progress);
            return { ...okr, progress, status };
        }).sort((a,b) => a.progress - b.progress);
        
        const totalOkrProgress = okrsDetails.reduce((sum, okr) => sum + okr.progress, 0);
        const avgOkrProgress = okrs.length > 0 ? Math.round(totalOkrProgress / okrs.length) : 0;
        
        const attention = [];
        const next = [];

        tasks.forEach(task => {
            const isOverdue = new Date(task.endDate) < today && task.status !== 'Concluído';
            if (task.priority === 'Alta' && isOverdue) {
                attention.push({ type: 'Atraso Crítico', text: task.title, date: task.endDate });
            }
            if (task.status === 'A Fazer' && task.priority === nextStepsPriority) {
                next.push({ type: `Foco ${nextStepsPriority}`, text: task.title, date: task.startDate });
            }
        });
        
        okrs.forEach(okr => {
            (okr.keyResults || []).forEach(kr => {
                (kr.attentionLog || []).forEach(log => {
                    if (!log.resolved) {
                        attention.push({ type: 'KR Sinalizado', text: kr.text, parentObjective: okr.objective, justification: log.text, krId: kr.id, okrId: okr.id, logId: log.id });
                    }
                });
            });
        });

        return {
            overallRoadmapProgress: overallProgress,
            overallOkrProgress: avgOkrProgress,
            projectStatusSummary: statusSummary,
            projectProgressSummary: progressSummary,
            okrsWithProgress: okrsDetails,
            attentionPoints: attention.slice(0, 5),
            nextSteps: next.sort((a,b) => new Date(a.date) - new Date(b.date)).slice(0, 5)
        };
    }, [tasks, okrs, nextStepsPriority]);

    const handleResolveAttention = (okrId, krId, logId) => {
        const targetOkr = okrs.find(o => o.id === okrId);
        if (!targetOkr) return;

        const updatedKeyResults = targetOkr.keyResults.map(kr => {
            if (kr.id === krId) {
                const updatedLog = (kr.attentionLog || []).map(log => {
                    if (log.id === logId) {
                        return { ...log, resolved: true };
                    }
                    return log;
                });
                return { ...kr, attentionLog: updatedLog };
            }
            return kr;
        });

        onSaveOkr({ ...targetOkr, keyResults: updatedKeyResults });
    };
    
    const getStatusColor = (progress) => {
        if (progress < 40) return 'bg-red-500';
        if (progress < 70) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    const StatCard = ({ icon, label, value, colorClass }) => (
        <div className="bg-gray-50 p-4 rounded-lg flex items-center gap-4">
            <div className={`p-3 rounded-full ${colorClass}`}>{icon}</div>
            <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-6" ref={executiveViewRef}>
            <Card>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-800 flex items-center"><Briefcase className="mr-3 text-indigo-600" />Painel Executivo</h2>
                        <p className="text-gray-600 mt-1">Visão consolidada do progresso, metas e riscos.</p>
                    </div>
                </div>
            </Card>
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-500 uppercase tracking-wider">Painel de Indicadores-Chave</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard icon={<TrendingUpIcon size={24} className="text-green-800" />} label="Progresso Geral do Roadmap" value={`${overallRoadmapProgress}%`} colorClass="bg-green-200" />
                    <StatCard icon={<Target size={24} className="text-indigo-800" />} label="Progresso Geral dos OKRs" value={`${overallOkrProgress}%`} colorClass="bg-indigo-200" />
                    <StatCard icon={<AlertTriangle size={24} className="text-yellow-800" />} label="Pontos de Atenção" value={attentionPoints.length} colorClass="bg-yellow-200" />
                    <StatCard icon={<Clock size={24} className="text-blue-800" />} label="Próximos Passos" value={nextSteps.length} colorClass="bg-blue-200" />
                </div>
            </div>
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-500 uppercase tracking-wider">Análise Detalhada</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    <Card className="lg:col-span-1">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center"><Layers className="mr-2 text-gray-500" />Status por Projeto</h3>
                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                            {projectStatusSummary.map(proj => (
                                <div key={proj.name} className="p-3 bg-gray-50 rounded-lg">
                                    <p className="font-semibold text-gray-700 truncate pr-4 mb-2">{proj.name} ({proj.tasksCount})</p>
                                    <div className="flex justify-around text-center text-xs">
                                        {Object.keys(STATUSES).map(s => (
                                            <div key={s}>
                                                <p className="font-bold text-lg">{proj[s] || 0}</p>
                                                <p className="text-gray-500">{s}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                    <Card className="lg:col-span-1">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center"><TrendingUp className="mr-2 text-gray-500" />Progresso por Projeto</h3>
                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                            {projectProgressSummary.length > 0 ? projectProgressSummary.map(proj => (
                                <div key={proj.name}>
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="font-semibold text-gray-700 truncate pr-4">{proj.name}</p>
                                        <span className="font-bold text-gray-800">{proj.progress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div className={`${getStatusColor(proj.progress)} h-2.5 rounded-full`} style={{ width: `${proj.progress}%` }}></div>
                                    </div>
                                </div>
                            )) : <p className="text-gray-500">Nenhum projeto com tarefas.</p>}
                        </div>
                    </Card>
                    <Card className="lg:col-span-1">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center"><Target className="mr-2 text-gray-500" />Status dos Objetivos</h3>
                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                            {okrsWithProgress.length > 0 ? okrsWithProgress.map(okr => (
                                <div key={okr.id}>
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="font-semibold text-gray-700 truncate pr-4">{okr.objective}</p>
                                        <span className={`px-2 py-0.5 text-xs font-semibold text-white rounded-full ${okr.status.color}`}>{okr.status.text}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                                            <div className={`${getStatusColor(okr.progress)} h-2.5 rounded-full`} style={{ width: `${okr.progress}%` }}></div>
                                        </div>
                                        <span className="font-bold text-gray-800 text-sm">{okr.progress}%</span>
                                    </div>
                                </div>
                            )) : <p className="text-gray-500">Nenhum OKR definido.</p>}
                        </div>
                    </Card>
                    <Card className="lg:col-span-3">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center"><AlertTriangle className="mr-2 text-red-500" />Inteligência e Ações</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="font-semibold text-gray-700 mb-2">Pontos de Atenção</h4>
                                 <div className="space-y-3">
                                    {attentionPoints.length > 0 ? attentionPoints.map((item, index) => (
                                        <div key={index} className="p-3 bg-red-50 border-l-4 border-red-500 rounded flex justify-between items-start">
                                            <div>
                                                <p className="font-semibold text-red-800">{item.type}: <span className="font-normal">{item.text}</span></p>
                                                {item.justification && <p className="text-sm text-red-600 mt-1 italic">"{item.justification}"</p>}
                                            </div>
                                            {item.logId && (
                                                <button onClick={() => handleResolveAttention(item.okrId, item.krId, item.logId)} className="ml-2 p-1 text-green-600 hover:bg-green-100 rounded-full"><Check size={18} /></button>
                                            )}
                                        </div>
                                    )) : <p className="text-gray-500 text-sm">Nenhum ponto de atenção identificado.</p>}
                                </div>
                            </div>
                             <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-semibold text-gray-700">Próximos Passos</h4>
                                    <div className="flex gap-1">
                                        {Object.keys(PRIORITIES).map(p => (
                                            <button key={p} onClick={() => setNextStepsPriority(p)} className={`px-2 py-0.5 text-xs rounded-full ${nextStepsPriority === p ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>{p}</button>
                                        ))}
                                    </div>
                                </div>
                                 <div className="space-y-3">
                                    {nextSteps.length > 0 ? nextSteps.map((item, index) => (
                                        <div key={index} className="p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
                                            <p className="font-semibold text-blue-800">{item.type}: <span className="font-normal">{item.text}</span></p>
                                            <p className="text-sm text-blue-600">Inicia em: {formatDate(item.date, false)}</p>
                                        </div>
                                    )) : <p className="text-gray-500 text-sm">Nenhuma ação com prioridade "{nextStepsPriority}" a ser iniciada.</p>}
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

// --- Componentes de OKR ---
const OkrForm = ({ okr, onSave, onCancel }) => {
    const [objective, setObjective] = useState(okr?.objective || '');
    const [keyResults, setKeyResults] = useState(okr?.keyResults || []);
    const [targetDate, setTargetDate] = useState(okr?.targetDate || '');

    const handleKrChange = (index, field, value) => {
        const newKrs = [...keyResults];
        const numericFields = ['startValue', 'targetValue', 'weight'];
        
        if (numericFields.includes(field)) {
            if (value === '') {
                newKrs[index][field] = '';
            } else {
                const parsedValue = parseFloat(value);
                if (!isNaN(parsedValue)) {
                    newKrs[index][field] = parsedValue;
                }
            }
        } else {
            newKrs[index][field] = value;
        }
        setKeyResults(newKrs);
    };

    const addKr = () => setKeyResults([...keyResults, { id: `kr_${Date.now()}`, text: '', startValue: 0, targetValue: 100, currentValue: 0, weight: 1, updates: [], attentionLog: [] }]);
    const removeKr = (index) => setKeyResults(keyResults.filter((_, i) => i !== index));
    
    const handleFormSave = () => {
        if (!objective.trim()) return;

        const finalKrs = keyResults
            .filter(kr => kr.text.trim() !== '')
            .map(kr => ({
                ...kr,
                weight: Number(kr.weight) > 0 ? Number(kr.weight) : 1,
                startValue: Number(kr.startValue) || 0,
                targetValue: Number(kr.targetValue) || 0,
                currentValue: Number(kr.currentValue) || 0,
            }));

        onSave({ id: okr?.id, objective, keyResults: finalKrs, targetDate, startDate: okr?.startDate || new Date().toISOString().split('T')[0] });
    };

    return (
        <Card className="border-indigo-300 border-2 mt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{okr ? 'Editar Objetivo' : 'Novo Objetivo'}</h3>
            <div className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-600 mb-1">Objetivo</label>
                        <input type="text" value={objective} onChange={e => setObjective(e.target.value)} placeholder="Ex: Lançar o melhor produto do mercado" className="w-full p-2 bg-white border border-gray-300 rounded-md text-gray-800" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Data Alvo</label>
                        <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="w-full p-2 bg-white border border-gray-300 rounded-md text-gray-800" />
                    </div>
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
                                    <div><label className="text-xs text-gray-500">Inicial</label><input type="number" value={kr.startValue ?? ''} onChange={e => handleKrChange(index, 'startValue', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-gray-800" /></div>
                                    <div><label className="text-xs text-gray-500">Meta</label><input type="number" value={kr.targetValue ?? ''} onChange={e => handleKrChange(index, 'targetValue', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-gray-800" /></div>
                                    <div><label className="text-xs text-gray-500">Atual</label><p className="w-full p-2 border border-gray-200 bg-gray-100 rounded-md text-gray-800">{kr.currentValue || 0}</p></div>
                                    <div><label className="text-xs text-gray-500">Peso</label><input type="number" value={kr.weight ?? ''} onChange={e => handleKrChange(index, 'weight', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-gray-800" /></div>
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

const KrHistoryModal = ({ isOpen, onClose, kr, onDeleteUpdate }) => {
    if (!isOpen) return null;
    const sortedUpdates = kr.updates ? [...kr.updates].sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Histórico de Progresso`} size="2xl">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">{kr.text}</h3>
                {sortedUpdates.length > 0 ? (
                    <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {sortedUpdates.map((update) => (
                            <li key={update.date} className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
                                <div>
                                    <span className="font-semibold text-indigo-700">Valor: {update.value}</span>
                                    <p className="text-sm text-gray-500">Registrado em: {formatDate(new Date(update.date), true)}</p>
                                </div>
                                <Button onClick={() => onDeleteUpdate(kr.id, update.date)} variant="ghost" className="!p-2 text-red-500 hover:bg-red-100"><Trash2 size={16} /></Button>
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-gray-500">Nenhum registro de progresso ainda.</p>}
                <div className="flex justify-end pt-4 border-t"><Button onClick={onClose} variant="secondary">Fechar</Button></div>
            </div>
        </Modal>
    );
};

const KrAttentionModal = ({ isOpen, onClose, kr, onSaveAttentionLog }) => {
    const [log, setLog] = useState(kr.attentionLog || []);
    const [newJustification, setNewJustification] = useState('');

    useEffect(() => {
        if(isOpen) setLog(kr.attentionLog || []);
    }, [isOpen, kr.attentionLog]);

    const handleAdd = () => {
        if (!newJustification.trim()) return;
        const newLogEntry = {
            id: `att_${Date.now()}`,
            text: newJustification,
            date: new Date().toISOString(),
            resolved: false
        };
        const updatedLog = [...log, newLogEntry];
        setLog(updatedLog);
        onSaveAttentionLog(kr.id, updatedLog);
        setNewJustification('');
    };

    const handleToggleResolve = (logId) => {
        const updatedLog = log.map(item => item.id === logId ? { ...item, resolved: !item.resolved } : item);
        setLog(updatedLog);
        onSaveAttentionLog(kr.id, updatedLog);
    };

    const handleDelete = (logId) => {
        const updatedLog = log.filter(item => item.id !== logId);
        setLog(updatedLog);
        onSaveAttentionLog(kr.id, updatedLog);
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Histórico de Pontos de Atenção" size="2xl">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">{kr.text}</h3>
                <div className="space-y-2">
                    <textarea value={newJustification} onChange={e => setNewJustification(e.target.value)} placeholder="Adicionar nova justificativa..." className="w-full p-2 border border-gray-300 rounded-md text-sm"></textarea>
                    <div className="flex justify-end"><Button onClick={handleAdd} className="!text-xs !py-1">Adicionar Ponto</Button></div>
                </div>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                    {log.sort((a,b) => new Date(b.date) - new Date(a.date)).map(item => (
                        <div key={item.id} className={`p-3 rounded-lg ${item.resolved ? 'bg-green-50' : 'bg-red-50'}`}>
                            <p className={`text-sm ${item.resolved ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{item.text}</p>
                            <div className="flex justify-between items-center mt-2">
                                <p className="text-xs text-gray-400">{formatDate(new Date(item.date), true)}</p>
                                <div className="flex gap-2">
                                    <Button onClick={() => handleToggleResolve(item.id)} variant="ghost" className={`!p-1 h-7 w-7 ${item.resolved ? 'text-yellow-600' : 'text-green-600'}`}>{item.resolved ? <X size={16}/> : <Check size={16} />}</Button>
                                    <Button onClick={() => handleDelete(item.id)} variant="ghost" className="!p-1 h-7 w-7 text-red-500"><Trash2 size={16} /></Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

const KrItem = ({ kr, okrStartDate, okrTargetDate, onUpdate, onDeleteUpdate, onSaveAttentionLog }) => {
    const [isUpdating, setIsUpdating] = useState(false);
    const [newValue, setNewValue] = useState(kr.currentValue);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isAttentionOpen, setIsAttentionOpen] = useState(false);
    
    const progress = calculateKrProgress(kr);
    const hasActiveAttention = (kr.attentionLog || []).some(log => !log.resolved);
    
    const pacingInfo = useMemo(() => calculatePacingInfo(
        okrStartDate,
        okrTargetDate,
        kr.startValue,
        kr.targetValue,
        kr.currentValue
    ), [okrStartDate, okrTargetDate, kr.startValue, kr.targetValue, kr.currentValue]);

    const handleUpdate = () => {
        onUpdate(kr.id, newValue);
        setIsUpdating(false);
    };

    return (
        <>
            <KrHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} kr={kr} onDeleteUpdate={onDeleteUpdate} />
            <KrAttentionModal isOpen={isAttentionOpen} onClose={() => setIsAttentionOpen(false)} kr={kr} onSaveAttentionLog={onSaveAttentionLog} />
            <div className="p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-all space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium text-gray-800 flex-1">{kr.text}</p>
                    <div className="flex items-center gap-4 mt-2 sm:mt-0">
                        <span className="text-xs text-gray-500">Peso: {kr.weight || 1}</span>
                        <div className="flex items-center gap-1">
                            {isUpdating ? (
                                <>
                                    <input type="number" value={newValue} onChange={e => setNewValue(parseFloat(e.target.value))} className="w-24 p-1 border border-indigo-400 rounded-md" autoFocus />
                                    <Button onClick={handleUpdate} variant="primary" className="!px-2 !py-1"><Check size={16} /></Button>
                                    <Button onClick={() => setIsUpdating(false)} variant="secondary" className="!px-2 !py-1"><X size={16} /></Button>
                                </>
                            ) : (
                                <>
                                    <span className="font-semibold text-indigo-600 text-sm">{kr.currentValue}</span>
                                    <span className="text-gray-500 text-sm">/ {kr.targetValue}</span>
                                    <Button onClick={() => setIsUpdating(true)} variant="ghost" className="!p-1 h-7 w-7"><Zap size={16} /></Button>
                                    <Button onClick={() => setIsHistoryOpen(true)} variant="ghost" className="!p-1 h-7 w-7"><History size={16} /></Button>
                                    <Button onClick={() => setIsAttentionOpen(true)} variant="ghost" className={`!p-1 h-7 w-7 ${hasActiveAttention ? 'text-red-500 bg-red-100' : ''}`}><AlertTriangle size={16} /></Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5"><div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div></div>
                </div>
                {pacingInfo.status !== 'no-date' && (
                    <div className="flex justify-between items-center text-xs text-gray-500 border-t pt-2 mt-2">
                        <div className="flex items-center gap-1">
                            <Clock size={14} />
                            <span>
                                {pacingInfo.daysRemaining !== null ? `${pacingInfo.daysRemaining} dias restantes` : (pacingInfo.status === 'completed' ? 'Meta atingida' : 'Prazo encerrado')}
                            </span>
                        </div>
                        {pacingInfo.requiredPace !== null && pacingInfo.status === 'on-track' && (
                            <div className="flex items-center gap-1" title="Ritmo necessário por mês para atingir a meta">
                                <Gauge size={14} />
                                <span>{pacingInfo.requiredPace}/mês</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

// --- Componente OkrView ---
const OkrView = ({ okrs, tasks, onSave, onDelete }) => {
    const [layout, setLayout] = useState('list');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingOkr, setEditingOkr] = useState(null);
    const [expandedOkrs, setExpandedOkrs] = useState({});
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [expandedTasks, setExpandedTasks] = useState({});

    const toggleExpansion = (okrId) => {
        setExpandedOkrs(prev => ({ ...prev, [okrId]: !prev[okrId] }));
    };

    const toggleTasksExpansion = (okrId) => {
        setExpandedTasks(prev => ({ ...prev, [okrId]: !prev[okrId] }));
    };

    const handleSave = (okrData) => {
        onSave(okrData);
        setIsFormOpen(false);
        setEditingOkr(null);
    };
    
    const handleKrUpdate = (okr, krId, newValue) => {
        const updatedKeyResults = okr.keyResults.map(kr => {
            if (kr.id === krId) {
                const newUpdate = { id: `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, value: newValue, date: new Date().toISOString() };
                const newUpdates = [...(kr.updates || []), newUpdate];
                return { ...kr, currentValue: newValue, updates: newUpdates };
            }
            return kr;
        });
        onSave({ ...okr, keyResults: updatedKeyResults });
    };

    const handleSaveAttentionLog = (okr, krId, attentionLog) => {
        const updatedKeyResults = okr.keyResults.map(kr => {
            if (kr.id === krId) {
                return { ...kr, attentionLog };
            }
            return kr;
        });
        onSave({ ...okr, keyResults: updatedKeyResults });
    };
    
    const handleDeleteUpdate = (okr, krId, updateId) => {
        const updatedKeyResults = okr.keyResults.map(kr => {
            if (kr.id === krId) {
                const remainingUpdates = (kr.updates || []).filter(u => u.date !== updateId);
                let newCurrentValue = kr.startValue; 
                if (remainingUpdates.length > 0) {
                    remainingUpdates.sort((a, b) => new Date(b.date) - new Date(a.date));
                    newCurrentValue = remainingUpdates[0].value;
                }
                return { ...kr, updates: remainingUpdates, currentValue: newCurrentValue };
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

    const requestDeleteOkr = (id) => {
        setItemToDelete({ id, type: 'okr' });
        setIsConfirmDeleteOpen(true);
    }
    
    const confirmDeleteOkr = () => {
        onDelete(itemToDelete.id, itemToDelete.type);
        setIsConfirmDeleteOpen(false);
        setItemToDelete(null);
    }

    return (
        <>
            <ConfirmModal isOpen={isConfirmDeleteOpen} onClose={() => setIsConfirmDeleteOpen(false)} onConfirm={confirmDeleteOkr} title="Confirmar Exclusão de Objetivo">
                <p>Tem certeza que deseja excluir este Objetivo e todos os seus KRs? Esta ação não pode ser desfeita.</p>
            </ConfirmModal>
            <div className="space-y-6">
                <Card>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex-1">
                            <h2 className="text-3xl font-bold text-gray-800 flex items-center"><Target className="mr-3 text-indigo-600" />Objetivos e Resultados-Chave</h2>
                            <p className="text-gray-600 mt-1">Defina e acompanhe as metas que impulsionam seu roadmap.</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                <button onClick={() => setLayout('list')} className={`p-2 rounded-md transition-colors ${layout === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}><List size={20} /></button>
                                <button onClick={() => setLayout('grid')} className={`p-2 rounded-md transition-colors ${layout === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}><LayoutGrid size={20} /></button>
                            </div>
                            {!isFormOpen && (
                                <Button onClick={() => setIsFormOpen(true)} variant="primary">
                                    <Plus size={16} /> Novo Objetivo
                                </Button>
                            )}
                        </div>
                    </div>
                </Card>
                {isFormOpen && <OkrForm key={editingOkr?.id || 'new'} okr={editingOkr} onSave={handleSave} onCancel={handleCancel} />}
                <div className={layout === 'list' ? "space-y-6" : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"}>
                    {okrs.map(okr => {
                        const progress = calculateOkrProgress(okr);
                        const isExpanded = !!expandedOkrs[okr.id];
                        const okrStatus = calculateOkrStatus(okr.startDate, okr.targetDate, progress);
                        const relatedTasks = tasks.filter(task => task.okrLink?.okrId === okr.id);
                        const areTasksExpanded = !!expandedTasks[okr.id];

                        return (
                            <Card key={okr.id} className={`transition-all duration-300 overflow-hidden ${layout === 'list' ? '!p-0' : ''}`}>
                                <div className={layout === 'list' ? 'p-6' : 'p-0'}>
                                    <div className="flex justify-between items-start">
                                        <h3 className="text-xl font-bold text-gray-800 flex-1 pr-4">{okr.objective}</h3>
                                        <div className="flex space-x-2">
                                            <Button onClick={(e) => { e.stopPropagation(); handleEdit(okr); }} variant="ghost" className="!p-2"><Edit size={16} /></Button>
                                            <Button onClick={(e) => { e.stopPropagation(); requestDeleteOkr(okr.id); }} variant="ghost" className="!p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></Button>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-sm text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} />
                                            <span>{formatDate(okr.startDate)} - {formatDate(okr.targetDate)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 text-xs font-semibold text-white rounded-full ${okrStatus.color}`}>{okrStatus.text}</span>
                                            {relatedTasks.length > 0 && layout === 'list' && (
                                                <span className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-gray-600 bg-gray-200 rounded-full">
                                                    <Layers size={12} />
                                                    {relatedTasks.length}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="mt-3 flex items-center gap-4 cursor-pointer" onClick={() => layout === 'list' && toggleExpansion(okr.id)}>
                                        <div className="w-full bg-gray-200 rounded-full h-4">
                                            <div className="bg-gradient-to-r from-sky-500 to-indigo-600 h-4 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                        </div>
                                        <span className="text-lg font-bold text-indigo-600">{progress}%</span>
                                        {layout === 'list' && <ChevronDown size={20} className={`text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />}
                                    </div>
                                </div>
                                
                                {layout === 'list' && (
                                    <div className={`transition-all duration-500 ease-in-out bg-gray-50/50 ${isExpanded ? 'max-h-[2500px] py-4' : 'max-h-0'}`}>
                                        <div className="px-6 space-y-3">
                                            {okr.keyResults.map(kr => (
                                                <KrItem key={kr.id} kr={kr} 
                                                    okrStartDate={okr.startDate}
                                                    okrTargetDate={okr.targetDate}
                                                    onUpdate={(krId, newValue) => handleKrUpdate(okr, krId, newValue)} 
                                                    onDeleteUpdate={(krId, updateId) => handleDeleteUpdate(okr, krId, updateId)}
                                                    onSaveAttentionLog={(krId, attentionLog) => handleSaveAttentionLog(okr, krId, attentionLog)}
                                                />
                                            ))}
                                        </div>
                                        
                                        {relatedTasks.length > 0 && (
                                            <div className="px-6 mt-4 pt-4 border-t border-gray-200">
                                                <div onClick={() => toggleTasksExpansion(okr.id)} className="flex justify-between items-center cursor-pointer select-none">
                                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">
                                                        <Layers size={14} className="mr-2" />
                                                        Atividades Vinculadas ({relatedTasks.length})
                                                    </h4>
                                                    <ChevronDown size={20} className={`text-gray-500 transition-transform duration-300 ${areTasksExpanded ? 'rotate-180' : ''}`} />
                                                </div>
                                                <div className={`transition-all duration-500 ease-in-out overflow-hidden ${areTasksExpanded ? 'max-h-[500px] mt-3' : 'max-h-0'}`}>
                                                    <ul className="space-y-2">
                                                        {relatedTasks.map(task => (
                                                             <li key={task.id} className="text-sm p-3 bg-white rounded-md border space-y-2">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="font-semibold text-gray-800">{task.title}</span>
                                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUSES[task.status]?.color || 'bg-gray-200 text-gray-800'}`}>
                                                                        {task.status}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-gray-500 gap-2">
                                                                    <div className="flex items-center gap-4">
                                                                        <span className="flex items-center gap-1.5" title="Prioridade">
                                                                            <ChevronsUpDown size={14} className={PRIORITIES[task.priority]?.textColor} />
                                                                            <strong className={PRIORITIES[task.priority]?.textColor}>{task.priority}</strong>
                                                                        </span>
                                                                        {task.projectTag && (
                                                                            <span className="flex items-center gap-1.5" title="Projeto">
                                                                                <Briefcase size={14} />
                                                                                <span>{task.projectTag}</span>
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5" title="Duração">
                                                                        <Calendar size={14} />
                                                                        <span>{formatDate(task.startDate)} → {formatDate(task.endDate)}</span>
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        )
                    })}
                </div>
            </div>
        </>
    );
};


// --- Componente de Login ---
const LoginScreen = () => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            setError('');
        } catch (error) {
            console.error("Erro durante o login com Google:", error);
            if (error.code === 'auth/unauthorized-domain') {
                setError('Erro: Este domínio não está autorizado. Verifique as configurações do Firebase.');
            } else {
                setError('Ocorreu um erro durante o login com Google.');
            }
        }
    };

    const handleEmailAuth = async (e) => {
        e.preventDefault();
        setError('');
        if (isLoginView) {
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                setError('E-mail ou senha inválidos.');
                console.error("Erro de login:", error);
            }
        } else {
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName: name });
            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    setError('Este e-mail já está em uso.');
                } else {
                    setError('Erro ao criar a conta. A senha deve ter no mínimo 6 caracteres.');
                }
                console.error("Erro de registro:", error);
            }
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="p-8 bg-white rounded-2xl shadow-xl max-w-md w-full">
                <h1 className="text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-600 mb-2">
                    Norte Estratégico
                </h1>
                <p className="text-center text-gray-600 mb-6">Seu planejamento estratégico em um só lugar.</p>
                
                <div className="flex border-b mb-6">
                    <button onClick={() => setIsLoginView(true)} className={`flex-1 py-2 font-semibold ${isLoginView ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Entrar</button>
                    <button onClick={() => setIsLoginView(false)} className={`flex-1 py-2 font-semibold ${!isLoginView ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Registrar-se</button>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-4">
                    {!isLoginView && (
                        <input type="text" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-3 border rounded-lg" />
                    )}
                    <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border rounded-lg" />
                    <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border rounded-lg" />
                    
                    <Button type="submit" variant="primary" className="w-full !py-3 !text-lg">
                        {isLoginView ? 'Entrar' : 'Criar Conta'}
                    </Button>
                </form>

                <div className="my-6 flex items-center">
                    <div className="flex-grow border-t"></div>
                    <span className="mx-4 text-gray-400">ou</span>
                    <div className="flex-grow border-t"></div>
                </div>

                <Button onClick={handleGoogleLogin} variant="secondary" className="w-full !py-3">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>
                    Continuar com Google
                </Button>

                {error && (
                    <p className="mt-4 text-sm text-red-600 bg-red-100 p-3 rounded-lg text-center">{error}</p>
                )}
            </div>
        </div>
    );
};


// --- INÍCIO DOS NOVOS COMPONENTES ---

// Componente para um único card de tarefa no quadro Kanban
const TaskCard = ({ task, onTaskClick }) => {
    const subtaskProgress = useMemo(() => {
        if (!task.subtasks || task.subtasks.length === 0) return null;
        const completed = task.subtasks.filter(s => s.completed).length;
        return { completed, total: task.subtasks.length };
    }, [task.subtasks]);

    const isBlocked = useMemo(() => task.blockerLog?.some(b => !b.unblockDate), [task.blockerLog]);

    return (
        <div
            onClick={() => onTaskClick(task)}
            className={`bg-white rounded-lg p-4 shadow-md border-l-4 ${isBlocked ? 'border-red-500' : (PRIORITIES[task.priority]?.borderColor || 'border-transparent')} cursor-pointer hover:shadow-lg hover:bg-gray-50 transition-all duration-200 space-y-3`}
        >
            <div className="flex justify-between items-start">
                <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded">{task.projectTag || 'Geral'}</span>
                <div className="flex items-center gap-2">
                    {isBlocked && <Lock size={14} className="text-red-500" title="Tarefa Bloqueada"/>}
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${PRIORITIES[task.priority]?.color} text-white`}>{task.priority}</span>
                </div>
            </div>

            <div>
                <p className="font-semibold text-gray-800">{task.title}</p>
                <p className="text-xs text-gray-400 font-mono mt-1">ID: {task.humanId}</p>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5" title="Prazo Final">
                    <Calendar size={14} />
                    <span>{formatDate(task.endDate)}</span>
                </div>
                {subtaskProgress && (
                    <div className="flex items-center gap-1.5" title="Subtarefas Concluídas">
                        <CheckCircle size={14} />
                        <span>{subtaskProgress.completed}/{subtaskProgress.total}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- NOVA ABA DE ATIVIDADES (KANBAN) ---
const TasksView = ({ tasks, onTaskClick, filters, setFilters }) => {
    const tasksByStatus = useMemo(() => {
        const grouped = {};
        Object.keys(STATUSES).forEach(status => {
            grouped[status] = [];
        });
        tasks.forEach(task => {
            if (grouped[task.status]) {
                grouped[task.status].push(task);
            }
        });
        return grouped;
    }, [tasks]);

    const allLabels = useMemo(() => {
        const labelSet = new Set();
        tasks.forEach(task => (task.labels || []).forEach(label => labelSet.add(label)));
        const labelOptions = {};
        Array.from(labelSet).sort().forEach(label => {
            labelOptions[label] = { label };
        });
        return labelOptions;
    }, [tasks]);

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-800 flex items-center"><ListTodo className="mr-3 text-indigo-600" />Quadro de Atividades</h2>
                        <p className="text-gray-600 mt-1">Visualize e gerencie o fluxo de trabalho do dia a dia.</p>
                    </div>
                    <Button onClick={() => onTaskClick(null)} variant="primary"><Plus size={16} /> Nova Tarefa</Button>
                </div>
                <div className="flex flex-wrap justify-start items-center gap-4 border-t pt-4 mt-4">
                    <FilterList title="Prioridade" options={PRIORITIES} active={filters.priority} onFilterChange={val => setFilters({...filters, priority: val})}/>
                    <FilterList title="Status" options={STATUSES} active={filters.status} onFilterChange={val => setFilters({...filters, status: val})}/>
                    {Object.keys(allLabels).length > 0 && (
                         <FilterList title="Etiqueta" options={allLabels} active={filters.label} onFilterChange={val => setFilters({...filters, label: val})}/>
                    )}
                </div>
            </Card>

            <div className="flex gap-6 overflow-x-auto pb-4">
                {Object.keys(STATUSES).map(status => (
                    <div key={status} className="flex-shrink-0 w-80 bg-gray-100 rounded-xl">
                        <div className={`p-4 sticky top-0 bg-gray-100 rounded-t-xl z-10 border-t-4 ${STATUSES[status].borderColor}`}>
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-gray-800">{STATUSES[status].label}</h3>
                                <span className="text-sm font-bold bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                                    {tasksByStatus[status].length}
                                </span>
                            </div>
                        </div>
                        <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                            {tasksByStatus[status].map(task => (
                                <TaskCard key={task.id} task={task} onTaskClick={onTaskClick} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
// --- FIM DOS NOVOS COMPONENTES ---

// --- Componente Principal ---
export default function App() {
    const [user, setUser] = useState(null);
    const [appId] = useState('general-control');
    const [error, setError] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [okrs, setOkrs] = useState([]);
    const [cycles, setCycles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('tasks');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isCyclesModalOpen, setIsCyclesModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [filters, setFilters] = useState({ priority: 'Todos', status: 'Todos', label: 'Todos' });
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(5);
    const [viewStartDate, setViewStartDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() - 15);
        date.setHours(0,0,0,0);
        return date;
    });
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) {
            setTasks([]);
            setOkrs([]);
            setCycles([]);
            return;
        };

        const userId = user.uid;
        const tasksCollectionPath = `artifacts/${appId}/users/${userId}/roadmap_tasks`;
        const okrsCollectionPath = `artifacts/${appId}/users/${userId}/okrs`;
        const cyclesCollectionPath = `artifacts/${appId}/users/${userId}/cycles`;

        const unsubscribeTasks = onSnapshot(query(collection(db, tasksCollectionPath)), (snapshot) => {
            setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => { console.error("Error fetching tasks:", err); setError("Falha ao carregar tarefas."); });

        const unsubscribeOkrs = onSnapshot(query(collection(db, okrsCollectionPath)), (snapshot) => {
            const okrData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            okrData.forEach(okr => {
                if (okr.keyResults) {
                    okr.keyResults.forEach(kr => {
                        if (kr.updates) kr.updates.sort((a, b) => new Date(a.date) - new Date(b.date));
                    });
                }
            });
            setOkrs(okrData);
        }, (err) => { console.error("Error fetching OKRs:", err); setError("Falha ao carregar OKRs."); });

        const unsubscribeCycles = onSnapshot(query(collection(db, cyclesCollectionPath)), (snapshot) => {
            setCycles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => { console.error("Error fetching cycles:", err); setError("Falha ao carregar ciclos."); });

        return () => { unsubscribeTasks(); unsubscribeOkrs(); unsubscribeCycles(); };
    }, [user, appId]);

    const handleSaveTask = async (taskData) => {
        if (!user) return;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/roadmap_tasks`;
        const dataForFirestore = {
            title: taskData.title,
            description: taskData.description,
            priority: taskData.priority,
            status: taskData.status,
            startDate: taskData.startDate,
            endDate: taskData.endDate,
            labels: taskData.labels,
            projectTag: taskData.projectTag,
            blockerLog: taskData.blockerLog,
            subtasks: taskData.subtasks,
            customColor: taskData.customColor,
            okrLink: taskData.okrLink
        };

        if (taskData.id) {
            const docRef = doc(db, collectionPath, taskData.id);
            await updateDoc(docRef, dataForFirestore);
        } else {
            dataForFirestore.createdAt = serverTimestamp();
            dataForFirestore.humanId = `${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            await addDoc(collection(db, collectionPath), dataForFirestore);
        }
    };

    const handleSaveOkr = async (okrData) => {
        if (!user) return;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/okrs`;
        if (okrData.id) {
            const { id, ...dataToUpdate } = okrData;
            await updateDoc(doc(db, collectionPath, id), dataToUpdate);
        } else {
            const { id, ...dataToAdd } = okrData;
            await addDoc(collection(db, collectionPath), { ...dataToAdd, createdAt: serverTimestamp() });
        }
    };

    const handleSaveCycles = async (cyclesToSave) => {
        if (!user) return;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/cycles`;
        
        for (const cycle of cyclesToSave) {
            const { localId, ...data } = cycle;
            if (cycle.id) {
                await updateDoc(doc(db, collectionPath, cycle.id), data);
            } else {
                await addDoc(collection(db, collectionPath), data);
            }
        }
    };

    const handleDeleteCycle = async (cycleId) => {
        if (!user) return;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/cycles`;
        await deleteDoc(doc(db, collectionPath, cycleId));
    };

    const requestDelete = (id, type) => {
        setItemToDelete({ id, type });
        setIsConfirmDeleteOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete || !user) return;
        const { id, type } = itemToDelete;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/${type === 'task' ? 'roadmap_tasks' : 'okrs'}`;
        await deleteDoc(doc(db, collectionPath, id));
        if (type === 'task') setIsTaskModalOpen(false);
        setIsConfirmDeleteOpen(false);
        setItemToDelete(null);
    };

    const handleOpenTaskModal = (task = null) => {
        setSelectedTask(task);
        setIsTaskModalOpen(true);
    };

    const handleLogout = () => {
        signOut(auth).catch((error) => {
            console.error("Erro ao sair:", error);
        });
    };

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const statusMatch = filters.status === 'Todos' || task.status === filters.status;
            const priorityMatch = filters.priority === 'Todos' || task.priority === filters.priority;
            const labelMatch = filters.label === 'Todos' || (task.labels && task.labels.includes(filters.label));
            return statusMatch && priorityMatch && labelMatch;
        }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    }, [tasks, filters]);

    if (isLoading) {
        return <div className="flex justify-center items-center min-h-screen bg-gray-50"><p className="text-lg text-gray-600">Carregando...</p></div>
    }

    if (!user) {
        return <LoginScreen />;
    }

    return (
        <div className="bg-gray-50 text-gray-800 min-h-screen p-4 md:p-6 font-sans">
            <div className="max-w-full mx-auto">
                <header className="mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-600">Norte Estratégico</h1>
                            <p className="text-gray-600 mt-1">Planeje, execute e apresente com clareza e foco.</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                                <User size={16} />
                                <span>{user.displayName || 'Usuário'}</span>
                            </div>
                            <Button onClick={handleLogout} variant="secondary" className="!px-3 !py-2">
                                <LogOut size={16} />
                            </Button>
                        </div>
                    </div>
                     <div className="mt-4">
                        <div className="inline-flex items-center bg-gray-200 rounded-lg p-1 space-x-1">
                            <Button onClick={() => setView('tasks')} variant={view === 'tasks' ? 'primary' : 'secondary'} className="!shadow-none"><ListTodo size={16} /> Atividades</Button>
                            <Button onClick={() => setView('workspace')} variant={view === 'workspace' ? 'primary' : 'secondary'} className="!shadow-none"><Layers size={16} /> Roadmap</Button>
                            <Button onClick={() => setView('okr')} variant={view === 'okr' ? 'primary' : 'secondary'} className="!shadow-none"><Target size={16} /> OKRs</Button>
                            <Button onClick={() => setView('executive')} variant={view === 'executive' ? 'primary' : 'secondary'} className="!shadow-none"><Briefcase size={16} /> Painel Executivo</Button>
                        </div>
                    </div>
                </header>
                <main>
                    {view === 'tasks' && (
                        <TasksView
                            tasks={filteredTasks}
                            onTaskClick={handleOpenTaskModal}
                            filters={filters}
                            setFilters={setFilters}
                        />
                    )}
                    {view === 'workspace' && (
                        <WorkspaceView
                            tasks={filteredTasks}
                            cycles={cycles}
                            onTaskClick={handleOpenTaskModal}
                            filters={filters}
                            setFilters={setFilters}
                            zoomLevel={zoomLevel}
                            setZoomLevel={setZoomLevel}
                            viewStartDate={viewStartDate}
                            setViewStartDate={setViewStartDate}
                            onOpenTaskModal={handleOpenTaskModal}
                            onOpenCyclesModal={() => setIsCyclesModalOpen(true)}
                        />
                    )}
                    {view === 'okr' && (
                        <OkrView 
                            okrs={okrs}
                            tasks={tasks}
                            onSave={handleSaveOkr}
                            onDelete={requestDelete}
                        />
                    )}
                    {view === 'executive' && <ExecutiveView tasks={tasks} okrs={okrs} onSaveOkr={handleSaveOkr} />}
                </main>
                <TaskModal
                    isOpen={isTaskModalOpen}
                    onClose={() => setIsTaskModalOpen(false)}
                    task={selectedTask}
                    tasks={tasks}
                    okrs={okrs}
                    onSave={handleSaveTask}
                    onDeleteRequest={requestDelete}
                />
                <CyclesModal 
                    isOpen={isCyclesModalOpen}
                    onClose={() => setIsCyclesModalOpen(false)}
                    cycles={cycles}
                    onSave={handleSaveCycles}
                    onDelete={handleDeleteCycle}
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
