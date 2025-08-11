import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, serverTimestamp } from 'firebase/firestore';
import { Target, Layers, Briefcase, Edit, Plus, Trash2, X, Tag, TrendingUp, Calendar, ListTodo, ZoomIn, ZoomOut, ChevronsUpDown, CheckCircle, MoreVertical, History, Check, Zap, ChevronDown, LayoutGrid, List, AlertTriangle, Clock, TrendingUp as TrendingUpIcon, Lock, LogOut, User, ArrowRight, Repeat, Sparkles, ShieldCheck, BarChart3, Gauge } from 'lucide-react';

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
  'Alta': { label: 'Alta', color: 'bg-red-400' },
  'Média': { label: 'Média', color: 'bg-yellow-400' },
  'Baixa': { label: 'Baixa', color: 'bg-blue-400' },
};
const STATUSES = {
  'A Fazer': { label: 'A Fazer', color: 'bg-gray-200 text-gray-800' },
  'Em Progresso': { label: 'Em Progresso', color: 'bg-indigo-200 text-indigo-800' },
  'Concluído': { label: 'Concluído', color: 'bg-green-200 text-green-800' },
  'Bloqueado': { label: 'Bloqueado', color: 'bg-red-200 text-red-800' },
};
const TASK_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6', '#a3a3a3'];
const CYCLE_COLORS = ['#fecaca', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8'];

const formatDate = (dateInput, includeTime = false) => {
  if (!dateInput) return '';
  const date = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
  const options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
};

// --- Funções de Cálculo (Lógica Original Mantida) ---
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
    const totalWeight = okr.keyResults.reduce((sum, kr) => sum + (Number(kr.weight) || 1), 0);
    if (totalWeight === 0) return 0;
    const weightedProgressSum = okr.keyResults.reduce((sum, kr) => {
        return sum + (calculateKrProgress(kr) * (Number(kr.weight) || 1));
    }, 0);
    return Math.round(weightedProgressSum / totalWeight);
};
const calculateOkrStatus = (startDate, targetDate, currentProgress) => {
    if (!startDate || !targetDate) return { status: 'no-date', text: 'Sem data', color: 'bg-gray-400' };
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const start = new Date(startDate); start.setUTCHours(0, 0, 0, 0);
    const target = new Date(targetDate); target.setUTCHours(0, 0, 0, 0);
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
    if (!task.subtasks || task.subtasks.length === 0) return task.status === 'Em Progresso' ? 50 : 0;
    const completedSubtasks = task.subtasks.filter(s => s.completed).length;
    return Math.round((completedSubtasks / task.subtasks.length) * 100);
};
const calculatePacingInfo = (startDate, targetDate, startValue, targetValue, currentValue) => {
    if (!startDate || !targetDate) return { daysRemaining: null, requiredPace: null, status: 'no-date' };
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const target = new Date(targetDate); target.setUTCHours(0, 0, 0, 0);
    if (calculateKrProgress({ startValue, targetValue, currentValue }) >= 100) return { daysRemaining: null, requiredPace: null, status: 'completed' };
    if (target < today) return { daysRemaining: 0, requiredPace: null, status: 'overdue' };
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const monthsRemaining = Math.max(1, (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44)); 
    const remainingValue = (Number(targetValue) || 0) - (Number(currentValue) || 0);
    if (remainingValue <= 0) return { daysRemaining, requiredPace: 0, status: 'completed' };
    return { daysRemaining, requiredPace: (remainingValue / monthsRemaining).toFixed(1), status: 'on-track' };
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

// --- Componentes de UI Genéricos ---
const Card = ({ children, className = '', ...props }) => <div className={`bg-white border border-gray-200/80 rounded-xl p-6 shadow-sm ${className}`} {...props}>{children}</div>;
const Button = ({ children, className = '', variant = 'primary', ...props }) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    const variantClasses = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
        ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-400'
    };
    return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
};
const Modal = ({ isOpen, onClose, title, children, size = '2xl' }) => {
    if (!isOpen) return null;
    const sizeClasses = { 'md': 'max-w-md', '2xl': 'max-w-2xl', '4xl': 'max-w-4xl' };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 animate-fade-in">
            <div className={`bg-white rounded-xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col transform transition-transform duration-300 scale-95 animate-slide-up`}>
                <header className="flex justify-between items-center p-4 border-b"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose}><X size={24} /></button></header>
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
            <footer className="flex justify-end space-x-4 pt-4 mt-4 border-t"><Button onClick={onClose} variant="secondary">Cancelar</Button><Button onClick={onConfirm} variant="danger">Confirmar</Button></footer>
        </Modal>
    );
};

// --- [FUNCIONALIDADE COMPLETA RESTAURADA] Componente TaskModal ---
const TaskModal = ({ isOpen, onClose, task, tasks, okrs, onSave, onDeleteRequest }) => {
    const getInitialFormState = () => {
        const today = new Date().toISOString().split('T')[0];
        if (task) {
            return {
                title: task.title || '', description: task.description || '', priority: task.priority || 'Média', status: task.status || 'A Fazer',
                startDate: task.startDate || today, endDate: task.endDate || today, labels: task.labels || [], projectTag: task.projectTag || '',
                blockerLog: task.blockerLog || [], subtasks: task.subtasks || [], customColor: task.customColor || '', okrLinkValue: `${task.okrLink?.okrId || ''}|${task.okrLink?.krId || ''}`
            };
        }
        return {
            title: '', description: '', priority: 'Média', status: 'A Fazer', startDate: today, endDate: today, labels: [], projectTag: '',
            blockerLog: [], subtasks: [], customColor: '', okrLinkValue: '|'
        };
    };

    const [formState, setFormState] = useState(getInitialFormState());
    const [expandedBlocker, setExpandedBlocker] = useState(null);

    useEffect(() => { if (isOpen) setFormState(getInitialFormState()); }, [task, isOpen]);

    const displayProjectList = useMemo(() => Array.from(new Set(tasks.map(t => t.projectTag).filter(Boolean))).sort(), [tasks]);
    const allLabels = useMemo(() => Array.from(new Set(tasks.flatMap(t => t.labels || []))).sort(), [tasks]);

    const handleChange = (e) => setFormState(p => ({ ...p, [e.target.name]: e.target.value }));
    const handleLabelsChange = (e) => setFormState(p => ({ ...p, labels: e.target.value.split(',').map(l => l.trim()).filter(Boolean) }));
    const handleLabelClick = (label) => setFormState(p => ({ ...p, labels: (p.labels || []).includes(label) ? p.labels.filter(l => l !== label) : [...p.labels, label] }));
    
    const handleSubtaskChange = (index, field, value) => {
        const newSubtasks = [...(formState.subtasks || [])];
        newSubtasks[index] = { ...newSubtasks[index], [field]: value };
        setFormState(p => ({ ...p, subtasks: newSubtasks }));
    };
    const addSubtask = () => setFormState(p => ({ ...p, subtasks: [...(p.subtasks || []), { id: `sub_${Date.now()}`, text: '', completed: false }] }));
    const removeSubtask = (index) => setFormState(p => ({ ...p, subtasks: (p.subtasks || []).filter((_, i) => i !== index) }));

    const addBlocker = () => {
        const newLog = [...(formState.blockerLog || []), { id: `block_${Date.now()}`, blockDate: new Date().toISOString().split('T')[0], blockReason: '', unblockDate: null }];
        setFormState(prev => ({ ...prev, blockerLog: newLog, status: 'Bloqueado' }));
    };
    const handleBlockerLogChange = (logId, field, value) => {
        const newLog = (formState.blockerLog || []).map(b => b.id === logId ? { ...b, [field]: value } : b);
        setFormState(prev => ({ ...prev, blockerLog: newLog }));
    };
    const handleUnblock = (logId) => {
        const newLog = (formState.blockerLog || []).map(b => b.id === logId ? { ...b, unblockDate: new Date().toISOString().split('T')[0] } : b);
        const isStillBlocked = newLog.some(b => !b.unblockDate);
        setFormState(prev => ({ ...prev, blockerLog: newLog, status: isStillBlocked ? 'Bloqueado' : 'A Fazer' }));
    };

    const handleSave = () => {
        const { okrLinkValue, ...restOfForm } = formState;
        const [okrId, krId] = (okrLinkValue || '|').split('|');
        onSave({ id: task?.id, ...restOfForm, okrLink: { okrId: okrId || '', krId: krId || '' } });
        onClose();
    };

    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={task?.id ? `Editar Tarefa` : "Nova Tarefa"} size="4xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Coluna Principal */}
                <div className="md:col-span-2 space-y-6">
                    <input type="text" name="title" value={formState.title} onChange={handleChange} placeholder="Título da Tarefa" className="w-full p-2 bg-transparent text-2xl font-bold border-b-2 focus:border-indigo-500 focus:outline-none" />
                    <textarea name="description" value={formState.description} onChange={handleChange} placeholder="Adicione uma descrição..." className="w-full p-2 bg-gray-50 rounded-md h-32 border focus:border-indigo-500 focus:outline-none"></textarea>
                    
                    {/* Subtarefas */}
                    <div>
                        <h3 className="font-semibold mb-2">Subtarefas</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                             {(formState.subtasks || []).map((sub, index) => (
                                <div key={sub.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-md">
                                    <input type="checkbox" checked={sub.completed} onChange={(e) => handleSubtaskChange(index, 'completed', e.target.checked)} className="h-5 w-5 rounded text-indigo-600" />
                                    <input type="text" value={sub.text} onChange={(e) => handleSubtaskChange(index, 'text', e.target.value)} className={`flex-grow p-1 bg-transparent border-b ${sub.completed ? 'line-through text-gray-500' : ''}`} placeholder="Descrição da subtarefa"/>
                                    <button onClick={() => removeSubtask(index)}><Trash2 size={16} className="text-red-400 hover:text-red-600" /></button>
                                </div>
                            ))}
                        </div>
                         <Button onClick={addSubtask} variant="secondary" className="mt-2 text-sm">Adicionar Subtarefa</Button>
                    </div>

                    {/* Histórico de Bloqueios */}
                    <div>
                        <h3 className="font-semibold mb-2">Histórico de Bloqueios</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                            {(formState.blockerLog || []).map(log => (
                                <div key={log.id} className="p-3 bg-gray-50 rounded-md border" >
                                    <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedBlocker(expandedBlocker === log.id ? null : log.id)}>
                                        <p className={`font-semibold ${log.unblockDate ? 'text-green-600' : 'text-red-600'}`}>{log.unblockDate ? 'Desbloqueado' : 'Bloqueado'} em {formatDate(log.blockDate)}</p>
                                        <ChevronDown size={16} className={`transition-transform ${expandedBlocker === log.id ? 'rotate-180' : ''}`} />
                                    </div>
                                    {expandedBlocker === log.id && (
                                        <div className="mt-2 space-y-2">
                                            <div>
                                                <label className="text-xs font-medium">Motivo do Bloqueio</label>
                                                <textarea value={log.blockReason} onChange={e => handleBlockerLogChange(log.id, 'blockReason', e.target.value)} className="w-full p-1 border rounded-md text-sm h-16"></textarea>
                                            </div>
                                            {!log.unblockDate ? ( <Button onClick={() => handleUnblock(log.id)} variant="secondary" className="!text-xs !py-1 w-full">Registrar Desbloqueio</Button> ) : ( <p className="text-xs">Desbloqueado em: {formatDate(log.unblockDate)}</p> )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <Button onClick={addBlocker} variant="secondary" className="mt-2 text-sm">Adicionar Bloqueio</Button>
                    </div>
                </div>

                {/* Coluna Lateral */}
                <div className="md:col-span-1 space-y-4 bg-gray-50 p-4 rounded-lg">
                    <div className="space-y-1">
                        <label className="block text-sm font-medium">Status</label>
                        <select name="status" value={formState.status} onChange={handleChange} disabled={(formState.blockerLog || []).some(b => !b.unblockDate)} className="w-full p-2 border rounded-md">{Object.keys(STATUSES).map(s => <option key={s} value={s}>{STATUSES[s].label}</option>)}</select>
                    </div>
                     <div className="space-y-1">
                        <label className="block text-sm font-medium">Datas</label>
                        <div className="space-y-2"><input type="date" name="startDate" value={formState.startDate} onChange={handleChange} className="w-full p-2 border rounded-md" /><input type="date" name="endDate" value={formState.endDate} onChange={handleChange} className="w-full p-2 border rounded-md" /></div>
                    </div>
                    <div className="space-y-1">
                        <label className="block text-sm font-medium">Prioridade</label>
                        <select name="priority" value={formState.priority} onChange={handleChange} className="w-full p-2 border rounded-md">{Object.keys(PRIORITIES).map(p => <option key={p} value={p}>{PRIORITIES[p].label}</option>)}</select>
                    </div>
                     <div className="space-y-1">
                        <label className="block text-sm font-medium">Projeto</label>
                        <input type="text" name="projectTag" list="projects" value={formState.projectTag} onChange={handleChange} className="w-full p-2 border rounded-md" />
                        <datalist id="projects">{displayProjectList.map(p => <option key={p} value={p} />)}</datalist>
                    </div>
                     <div className="space-y-1">
                        <label className="block text-sm font-medium">Etiquetas</label>
                        <input type="text" value={(formState.labels || []).join(', ')} onChange={handleLabelsChange} className="w-full p-2 border rounded-md" placeholder="UX, Backend..." />
                        <div className="flex flex-wrap gap-2 mt-2">{allLabels.map(label => (<button key={label} onClick={() => handleLabelClick(label)} className={`px-2 py-1 text-xs rounded-full ${ (formState.labels || []).includes(label) ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>{label}</button>))}</div>
                    </div>
                     <div className="space-y-1">
                        <label className="block text-sm font-medium">Vincular ao OKR</label>
                        <select name="okrLinkValue" value={formState.okrLinkValue} onChange={handleChange} className="w-full p-2 border rounded-md">
                            <option value="|">Nenhum</option>
                            {okrs.map(okr => (<optgroup key={okr.id} label={okr.objective}>{(okr.keyResults || []).map(kr => <option key={`${okr.id}|${kr.id}`} value={`${okr.id}|${kr.id}`}>{kr.text}</option>)}</optgroup>))}
                        </select>
                    </div>
                </div>

                {/* Footer do Modal */}
                <div className="md:col-span-3 flex justify-between items-center pt-6 border-t">
                    <div>{task && <Button onClick={() => onDeleteRequest(task.id, 'task')} variant="danger"><Trash2 size={16} /> Excluir</Button>}</div>
                    <div className="flex gap-4"><Button onClick={onClose} variant="secondary">Cancelar</Button><Button onClick={handleSave}>Salvar Tarefa</Button></div>
                </div>
            </div>
        </Modal>
    );
};

// --- [FUNCIONALIDADE COMPLETA RESTAURADA] Componentes de OKR ---
const OkrForm = ({ okr, onSave, onCancel }) => {
    const [objective, setObjective] = useState(okr?.objective || '');
    const [keyResults, setKeyResults] = useState(okr?.keyResults || []);
    const [targetDate, setTargetDate] = useState(okr?.targetDate || '');
    const handleKrChange = (index, field, value) => {
        const newKrs = [...keyResults];
        newKrs[index][field] = value;
        setKeyResults(newKrs);
    };
    const addKr = () => setKeyResults([...keyResults, { id: `kr_${Date.now()}`, text: '', startValue: 0, targetValue: 100, currentValue: 0, weight: 1, updates: [], attentionLog: [] }]);
    const removeKr = (index) => setKeyResults(keyResults.filter((_, i) => i !== index));
    const handleFormSave = () => {
        if (!objective.trim()) return;
        onSave({ id: okr?.id, objective, keyResults, targetDate, startDate: okr?.startDate || new Date().toISOString().split('T')[0] });
    };
    return (
        <Card className="border-indigo-300 border-2 mt-6">
            <h3 className="text-xl font-bold mb-4">{okr ? 'Editar Objetivo' : 'Novo Objetivo'}</h3>
            <div className="space-y-6">
                 <div><label>Objetivo</label><input type="text" value={objective} onChange={e => setObjective(e.target.value)} placeholder="Ex: Lançar o melhor produto" className="w-full p-2 border rounded-md" /></div>
                 <div><label>Data Alvo</label><input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="w-full p-2 border rounded-md" /></div>
                <div>
                    <label className="block mb-2">Resultados-Chave</label>
                    <div className="space-y-3">
                        {keyResults.map((kr, index) => (
                            <div key={kr.id || index} className="p-3 bg-gray-50 rounded-md border space-y-2">
                                <div className="flex items-center gap-2"><input type="text" value={kr.text} onChange={e => handleKrChange(index, 'text', e.target.value)} placeholder={`KR ${index + 1}`} className="flex-grow p-2 border rounded-md" /><button onClick={() => removeKr(index)} className="text-red-500"><Trash2 size={16} /></button></div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div><label className="text-xs">Inicial</label><input type="number" value={kr.startValue || ''} onChange={e => handleKrChange(index, 'startValue', e.target.value)} className="w-full p-2 border rounded-md" /></div>
                                    <div><label className="text-xs">Meta</label><input type="number" value={kr.targetValue || ''} onChange={e => handleKrChange(index, 'targetValue', e.target.value)} className="w-full p-2 border rounded-md" /></div>
                                    <div><label className="text-xs">Atual</label><p className="w-full p-2 bg-gray-100 rounded-md">{kr.currentValue || 0}</p></div>
                                    <div><label className="text-xs">Peso</label><input type="number" value={kr.weight || 1} onChange={e => handleKrChange(index, 'weight', e.target.value)} className="w-full p-2 border rounded-md" /></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button onClick={addKr} variant="secondary" className="mt-3 text-sm"><Plus size={16} /> Adicionar KR</Button>
                </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6"><Button onClick={onCancel} variant="secondary">Cancelar</Button><Button onClick={handleFormSave}>Salvar Objetivo</Button></div>
        </Card>
    );
};
const KrItem = ({ kr, okrStartDate, okrTargetDate, onUpdate }) => {
    const [isUpdating, setIsUpdating] = useState(false);
    const [newValue, setNewValue] = useState(kr.currentValue);
    const progress = calculateKrProgress(kr);
    const pacingInfo = useMemo(() => calculatePacingInfo(okrStartDate, okrTargetDate, kr.startValue, kr.targetValue, kr.currentValue), [okrStartDate, okrTargetDate, kr.startValue, kr.targetValue, kr.currentValue]);
    const handleUpdate = () => { onUpdate(kr.id, newValue); setIsUpdating(false); };
    return (
        <div className="p-4 bg-white rounded-lg border hover:border-gray-300 space-y-3">
            <div className="flex justify-between items-center"><p className="font-medium flex-1">{kr.text}</p>
                <div className="flex items-center gap-4">
                    {isUpdating ? (<><input type="number" value={newValue} onChange={e => setNewValue(parseFloat(e.target.value))} className="w-24 p-1 border rounded-md" autoFocus /><Button onClick={handleUpdate} className="!px-2 !py-1"><Check size={16} /></Button><Button onClick={() => setIsUpdating(false)} variant="secondary" className="!px-2 !py-1"><X size={16} /></Button></>) 
                    : (<><span className="font-semibold text-indigo-600">{kr.currentValue} / {kr.targetValue}</span><Button onClick={() => setIsUpdating(true)} variant="ghost" className="!p-1"><Zap size={16} /></Button></>)}
                </div>
            </div>
            <div><div className="w-full bg-gray-200 rounded-full h-2.5"><div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div></div></div>
            {pacingInfo.status !== 'no-date' && (
                <div className="flex justify-between text-xs text-gray-500 pt-2 border-t">
                    <div className="flex items-center gap-1"><Clock size={14} /><span>{pacingInfo.daysRemaining !== null ? `${pacingInfo.daysRemaining} dias restantes` : 'Prazo encerrado'}</span></div>
                    {pacingInfo.requiredPace !== null && <div className="flex items-center gap-1"><Gauge size={14} /><span>{pacingInfo.requiredPace}/mês</span></div>}
                </div>
            )}
        </div>
    );
};
const OkrView = ({ okrs, onSave, onDelete }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingOkr, setEditingOkr] = useState(null);
    const [expandedOkrs, setExpandedOkrs] = useState({});
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const toggleExpansion = (okrId) => setExpandedOkrs(prev => ({ ...prev, [okrId]: !prev[okrId] }));
    const handleSave = (okrData) => { onSave(okrData); setIsFormOpen(false); setEditingOkr(null); };
    const handleKrUpdate = (okr, krId, newValue) => {
        const updatedKeyResults = okr.keyResults.map(kr => kr.id === krId ? { ...kr, currentValue: newValue, updates: [...(kr.updates || []), { value: newValue, date: new Date().toISOString() }] } : kr);
        onSave({ ...okr, keyResults: updatedKeyResults });
    };
    const handleEdit = (okr) => { setEditingOkr(okr); setIsFormOpen(true); };
    const requestDeleteOkr = (id) => { setItemToDelete({ id, type: 'okr' }); setIsConfirmDeleteOpen(true); };
    const confirmDeleteOkr = () => { onDelete(itemToDelete.id, itemToDelete.type); setIsConfirmDeleteOpen(false); setItemToDelete(null); };
    return (
        <>
            <ConfirmModal isOpen={isConfirmDeleteOpen} onClose={() => setIsConfirmDeleteOpen(false)} onConfirm={confirmDeleteOkr} title="Confirmar Exclusão"><p>Tem certeza? Esta ação não pode ser desfeita.</p></ConfirmModal>
            <div className="space-y-6">
                <Card><div className="flex justify-between items-center"><div><h2 className="text-3xl font-bold flex items-center"><Target className="mr-3 text-indigo-600" />OKRs</h2><p className="text-gray-600 mt-1">Defina e acompanhe suas metas.</p></div>{!isFormOpen && <Button onClick={() => setIsFormOpen(true)}><Plus size={16} /> Novo Objetivo</Button>}</div></Card>
                {isFormOpen && <OkrForm key={editingOkr?.id || 'new'} okr={editingOkr} onSave={handleSave} onCancel={() => { setIsFormOpen(false); setEditingOkr(null); }} />}
                <div className="space-y-6">
                    {okrs.map(okr => {
                        const progress = calculateOkrProgress(okr);
                        const isExpanded = !!expandedOkrs[okr.id];
                        const okrStatus = calculateOkrStatus(okr.startDate, okr.targetDate, progress);
                        return (
                            <Card key={okr.id} className="!p-0">
                                <div className="p-6">
                                    <div className="flex justify-between items-start"><h3 className="text-xl font-bold flex-1 pr-4">{okr.objective}</h3><div className="flex"><Button onClick={() => handleEdit(okr)} variant="ghost" className="!p-2"><Edit size={16} /></Button><Button onClick={() => requestDeleteOkr(okr.id)} variant="ghost" className="!p-2 text-red-500"><Trash2 size={16} /></Button></div></div>
                                    <div className="mt-2 flex justify-between items-center text-sm text-gray-500"><div className="flex items-center gap-2"><Calendar size={14} /><span>{formatDate(okr.startDate)} - {formatDate(okr.targetDate)}</span></div><div className={`flex items-center gap-2 px-2 py-1 text-xs font-semibold text-white rounded-full ${okrStatus.color}`}><TrendingUpIcon size={14} /><span>{okrStatus.text}</span></div></div>
                                    <div className="mt-3 flex items-center gap-4 cursor-pointer" onClick={() => toggleExpansion(okr.id)}>
                                        <div className="w-full bg-gray-200 rounded-full h-4"><div className="bg-gradient-to-r from-sky-500 to-indigo-600 h-4 rounded-full" style={{ width: `${progress}%` }}></div></div>
                                        <span className="text-lg font-bold text-indigo-600">{progress}%</span>
                                        <ChevronDown size={20} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>
                                <div className={`transition-all duration-500 bg-gray-50/50 ${isExpanded ? 'max-h-[1000px] py-4' : 'max-h-0'}`}><div className="px-6 space-y-3">{okr.keyResults.map(kr => <KrItem key={kr.id} kr={kr} okrStartDate={okr.startDate} okrTargetDate={okr.targetDate} onUpdate={(krId, newValue) => handleKrUpdate(okr, krId, newValue)} />)}</div></div>
                            </Card>
                        )
                    })}
                </div>
            </div>
        </>
    );
};

// --- [FUNCIONALIDADE COMPLETA RESTAURADA] Componente ExecutiveView ---
const ExecutiveView = ({ tasks, okrs }) => {
    const { overallRoadmapProgress, overallOkrProgress, projectProgressSummary, okrsWithProgress, attentionPoints } = useMemo(() => {
        const today = new Date();
        const roadmapMetrics = tasks.reduce((acc, task) => {
            const duration = Math.max(1, (new Date(task.endDate).getTime() - new Date(task.startDate).getTime()) / (1000 * 60 * 60 * 24));
            acc.totalDuration += duration;
            acc.totalWeightedProgress += calculateTaskProgress(task) * duration;
            return acc;
        }, { totalDuration: 0, totalWeightedProgress: 0 });
        const overallProgress = roadmapMetrics.totalDuration > 0 ? Math.round(roadmapMetrics.totalWeightedProgress / roadmapMetrics.totalDuration) : 0;
        
        const projects = tasks.reduce((acc, task) => {
            const tag = task.projectTag || 'Sem Projeto';
            if (!acc[tag]) acc[tag] = { tasks: [] };
            acc[tag].tasks.push(task);
            return acc;
        }, {});
        
        const progressSummary = Object.keys(projects).map(tag => {
            const projectTasks = projects[tag].tasks;
            if (projectTasks.length === 0) return { name: tag, progress: 0 };
            const totalProgress = projectTasks.reduce((sum, task) => sum + calculateTaskProgress(task), 0);
            return { name: tag, progress: Math.round(totalProgress / projectTasks.length) };
        }).sort((a,b) => a.progress - b.progress);

        const okrsDetails = okrs.map(okr => ({ ...okr, progress: calculateOkrProgress(okr), status: calculateOkrStatus(okr.startDate, okr.targetDate, calculateOkrProgress(okr)) })).sort((a,b) => a.progress - b.progress);
        const totalOkrProgress = okrsDetails.reduce((sum, okr) => sum + okr.progress, 0);
        const avgOkrProgress = okrs.length > 0 ? Math.round(totalOkrProgress / okrs.length) : 0;
        
        const attention = tasks.filter(task => new Date(task.endDate) < today && task.status !== 'Concluído').map(task => ({ type: 'Atraso Crítico', text: task.title }));
        
        return { overallRoadmapProgress: overallProgress, overallOkrProgress: avgOkrProgress, projectProgressSummary: progressSummary, okrsWithProgress: okrsDetails, attentionPoints: attention };
    }, [tasks, okrs]);
    
    const StatCard = ({ icon, label, value, colorClass }) => (
        <div className="bg-gray-50 p-4 rounded-lg flex items-center gap-4"><div className={`p-3 rounded-full ${colorClass}`}>{icon}</div><div><p className="text-sm text-gray-500">{label}</p><p className="text-2xl font-bold">{value}</p></div></div>
    );
    const getStatusColor = (progress) => {
        if (progress < 40) return 'bg-red-500';
        if (progress < 70) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    return (
        <div className="space-y-6">
            <Card>
                <h2 className="text-3xl font-bold flex items-center"><Briefcase className="mr-3 text-indigo-600" />Painel Executivo</h2>
                <p className="text-gray-600 mt-1">Visão consolidada do progresso, metas e riscos.</p>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<TrendingUpIcon size={24} />} label="Progresso do Roadmap" value={`${overallRoadmapProgress}%`} colorClass="bg-green-200" />
                <StatCard icon={<Target size={24} />} label="Progresso dos OKRs" value={`${overallOkrProgress}%`} colorClass="bg-indigo-200" />
                <StatCard icon={<AlertTriangle size={24} />} label="Pontos de Atenção" value={attentionPoints.length} colorClass="bg-yellow-200" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <h3 className="text-xl font-semibold mb-4">Progresso por Projeto</h3>
                    <div className="space-y-4">{projectProgressSummary.map(proj => (<div key={proj.name}><div className="flex justify-between"><p>{proj.name}</p><span>{proj.progress}%</span></div><div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`${getStatusColor(proj.progress)} h-2.5 rounded-full`} style={{ width: `${proj.progress}%` }}></div></div></div>))}</div>
                </Card>
                <Card>
                    <h3 className="text-xl font-semibold mb-4">Status dos Objetivos</h3>
                    <div className="space-y-4">{okrsWithProgress.map(okr => (<div key={okr.id}><div className="flex justify-between"><p>{okr.objective}</p><span className={`px-2 py-0.5 text-xs text-white rounded-full ${okr.status.color}`}>{okr.status.text}</span></div><div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`${getStatusColor(okr.progress)} h-2.5 rounded-full`} style={{ width: `${okr.progress}%` }}></div></div></div>))}</div>
                </Card>
            </div>
        </div>
    );
};

// --- [NOVO e MELHORADO] Componentes da Aplicação (Landing, Login, etc.) ---
const LandingPage = ({ onLoginClick }) => {
    const Feature = ({ icon, title, children }) => (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-center gap-4 mb-3"><div className="bg-indigo-100 text-indigo-600 p-3 rounded-full">{icon}</div><h3 className="text-xl font-bold text-gray-800">{title}</h3></div>
            <p className="text-gray-600">{children}</p>
        </div>
    );
    return (
        <div className="bg-gray-50 font-sans">
            <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-40 border-b"><div className="container mx-auto px-6 py-4 flex justify-between items-center"><h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">Norte Estratégico</h1><Button onClick={onLoginClick}>Acessar Plataforma</Button></div></header>
            <main className="container mx-auto px-6 py-20 md:py-32 text-center">
                <h2 className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-tight">Transforme <span className="text-indigo-600">Estratégia</span> em <span className="text-cyan-500">Resultados</span></h2>
                <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">A plataforma definitiva para gestão de OKRs e Roadmaps. Alinhe suas equipes, acompanhe o progresso em tempo real e alcance seus objetivos mais ambiciosos.</p>
                <div className="mt-10"><Button onClick={onLoginClick} className="!px-8 !py-4 !text-lg">Comece a usar agora</Button></div>
            </main>
            <section id="features" className="bg-white py-20"><div className="container mx-auto px-6"><div className="text-center mb-12"><h2 className="text-3xl font-bold text-gray-800">Tudo para uma gestão de alta performance</h2></div><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"><Feature icon={<Target size={24} />} title="Gestão de OKRs">Defina objetivos claros e mensure o sucesso com resultados-chave.</Feature><Feature icon={<Layers size={24} />} title="Roadmap Visual">Planeje suas entregas em uma timeline interativa e moderna.</Feature><Feature icon={<Repeat size={24} />} title="Ciclos de Trabalho">Organize seu trabalho em Sprints, PIs ou trimestres.</Feature><Feature icon={<Briefcase size={24} />} title="Painel Executivo">Dashboards inteligentes com a visão consolidada para a liderança.</Feature><Feature icon={<BarChart3 size={24} />} title="Ritmo e Progresso">Saiba se você está adiantado, no ritmo ou em risco para atingir suas metas.</Feature><Feature icon={<ShieldCheck size={24} />} title="Seguro e Confiável">Construído sobre a infraestrutura do Google para garantir seus dados.</Feature></div></div></section>
            <footer className="bg-gray-800 text-white py-8"><div className="container mx-auto px-6 text-center"><p>&copy; {new Date().getFullYear()} Norte Estratégico.</p></div></footer>
        </div>
    );
};
const LoginScreen = ({ onLoginSuccess }) => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const handleAuthAction = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (isLoginView) { await signInWithEmailAndPassword(auth, email, password); } 
            else { const userCredential = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(userCredential.user, { displayName: name }); }
            onLoginSuccess();
        } catch (err) {
            setError('Ocorreu um erro. Verifique os dados ou a força da sua senha.');
            console.error("Auth Error:", err);
        }
    };
    const handleGoogleLogin = async () => {
        try { await signInWithPopup(auth, new GoogleAuthProvider()); onLoginSuccess(); } 
        catch (error) { setError('Falha no login com Google.'); console.error("Google Auth Error:", error); }
    };
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="p-8 bg-white rounded-2xl shadow-xl max-w-md w-full">
                <h1 className="text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500 mb-2">Norte Estratégico</h1>
                <div className="flex border-b mb-6"><button onClick={() => setIsLoginView(true)} className={`flex-1 py-2 font-semibold ${isLoginView ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Entrar</button><button onClick={() => setIsLoginView(false)} className={`flex-1 py-2 font-semibold ${!isLoginView ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Registrar-se</button></div>
                <form onSubmit={handleAuthAction} className="space-y-4">
                    {!isLoginView && <input type="text" placeholder="Nome Completo" value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-3 border rounded-lg" />}
                    <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border rounded-lg" />
                    <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border rounded-lg" />
                    <Button type="submit" variant="primary" className="w-full !py-3 !text-lg">{isLoginView ? 'Entrar' : 'Criar Conta'}</Button>
                </form>
                <div className="my-6 flex items-center"><div className="flex-grow border-t"></div><span className="mx-4 text-gray-400">ou</span><div className="flex-grow border-t"></div></div>
                <Button onClick={handleGoogleLogin} variant="secondary" className="w-full !py-3"> <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg> Continuar com Google</Button>
                {error && <p className="mt-4 text-sm text-red-600 bg-red-100 p-3 rounded-lg text-center">{error}</p>}
            </div>
        </div>
    );
};
const CyclesModal = ({ isOpen, onClose, cycles, onSave, onDelete }) => {
    const [localCycles, setLocalCycles] = useState([]);
    useEffect(() => { if (isOpen) setLocalCycles(cycles.map(c => ({...c, localId: c.id || `new_${Date.now()}_${Math.random()}`}))); }, [isOpen, cycles]);
    const handleCycleChange = (index, field, value) => { const updated = [...localCycles]; updated[index][field] = value; setLocalCycles(updated); };
    const addCycle = () => setLocalCycles([...localCycles, { localId: `new_${Date.now()}`, name: '', startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], color: CYCLE_COLORS[localCycles.length % CYCLE_COLORS.length] }]);
    const removeCycle = (cycleToRemove) => { if (cycleToRemove.id) onDelete(cycleToRemove.id); setLocalCycles(localCycles.filter(c => c.localId !== cycleToRemove.localId)); };
    const handleSaveAll = () => { onSave(localCycles.filter(c => c.name.trim() !== '')); onClose(); };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gerenciar Ciclos de Trabalho" size="2xl">
            <div className="space-y-4"><div className="space-y-3 max-h-96 overflow-y-auto pr-2">{localCycles.map((cycle, index) => (<div key={cycle.localId} className="p-4 bg-gray-50 rounded-lg border flex flex-col md:flex-row gap-4"><input type="text" placeholder="Nome do Ciclo" value={cycle.name} onChange={e => handleCycleChange(index, 'name', e.target.value)} className="w-full p-2 border rounded-md" /><input type="date" value={cycle.startDate} onChange={e => handleCycleChange(index, 'startDate', e.target.value)} className="p-2 border rounded-md" /><input type="date" value={cycle.endDate} onChange={e => handleCycleChange(index, 'endDate', e.target.value)} className="p-2 border rounded-md" /><input type="color" value={cycle.color} onChange={e => handleCycleChange(index, 'color', e.target.value)} className="p-1 h-10 w-12 border rounded-md" /><Button onClick={() => removeCycle(cycle)} variant="ghost" className="text-red-500"><Trash2 size={16} /></Button></div>))}</div><Button onClick={addCycle} variant="secondary"><Plus size={16} /> Adicionar Ciclo</Button></div>
            <footer className="flex justify-end space-x-4 pt-4 mt-4 border-t"><Button onClick={onClose} variant="secondary">Cancelar</Button><Button onClick={handleSaveAll}>Salvar Ciclos</Button></footer>
        </Modal>
    );
};
const ModernTimeline = ({ tasks, cycles, onTaskClick, zoomLevel, viewStartDate }) => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const dayWidth = useMemo(() => 20 + (zoomLevel * 5), [zoomLevel]);
    const { days, timelineWidth, todayPosition } = useMemo(() => {
        const allEndDates = [...tasks.map(t => t.endDate), ...cycles.map(c => c.endDate)];
        const maxEndDate = allEndDates.length > 0 ? new Date(Math.max.apply(null, allEndDates.filter(Boolean).map(d => new Date(d).getTime()))) : null;
        const timelineEndDate = new Date(viewStartDate);
        timelineEndDate.setDate(timelineEndDate.getDate() + 60);
        if (maxEndDate && maxEndDate > timelineEndDate) timelineEndDate.setDate(maxEndDate.getDate() + 15);
        const daysInView = getDaysInView(viewStartDate, timelineEndDate);
        const width = daysInView.length * dayWidth;
        const todayPos = (today.getTime() - new Date(viewStartDate).getTime()) / (1000 * 60 * 60 * 24) * dayWidth;
        return { days: daysInView, timelineWidth: width, todayPosition: todayPos };
    }, [viewStartDate, dayWidth, tasks, cycles]);
    const groupedTasks = useMemo(() => Object.keys(tasks.reduce((acc, task) => { (acc[task.projectTag || 'Sem Projeto'] = acc[task.projectTag || 'Sem Projeto'] || []).push(task); return acc; }, {})).sort().reduce((obj, key) => { obj[key] = tasks.filter(t => (t.projectTag || 'Sem Projeto') === key); return obj; }, {}), [tasks]);
    const [collapsedGroups, setCollapsedGroups] = useState({});
    const toggleGroup = (group) => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    return (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden"><div className="overflow-x-auto"><div style={{ width: timelineWidth }} className="relative">
            <div className="sticky top-0 z-20 bg-gray-50/70 backdrop-blur-sm h-16 border-b flex">{days.map(day => (<div key={day.toISOString()} className={`flex-shrink-0 text-center font-semibold border-r py-1 flex flex-col justify-center items-center ${day.toDateString() === today.toDateString() ? 'bg-indigo-100' : ''}`} style={{ width: dayWidth }}><span className="text-xs text-gray-500">{new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(day)}</span><span className={`text-lg ${day.toDateString() === today.toDateString() ? 'text-indigo-600 font-bold' : ''}`}>{day.getDate()}</span></div>))}</div>
            <div className="absolute top-0 left-0 w-full h-full z-0">{days.map((day, index) => (<div key={index} className={`h-full border-r ${day.getUTCDay() === 0 || day.getUTCDay() === 6 ? 'bg-gray-50/50' : 'border-gray-100'}`} style={{ width: dayWidth }}></div>))}{todayPosition >= 0 && <div className="absolute top-0 h-full w-0.5 bg-red-500 z-10" style={{ left: todayPosition }} />} {cycles.map(cycle => { const startOffset = (new Date(cycle.startDate).getTime() - viewStartDate.getTime()) / 86400000; const duration = Math.max(1, (new Date(cycle.endDate).getTime() - new Date(cycle.startDate).getTime()) / 86400000 + 1); return (<div key={cycle.id} className="absolute top-16 bottom-0 z-0" style={{ left: `${startOffset * dayWidth}px`, width: `${duration * dayWidth}px` }}><div className="h-full w-full border-x" style={{ backgroundColor: cycle.color, opacity: 0.15, borderColor: cycle.color }}></div><div className="absolute -top-0.5 left-0 w-full font-bold text-center text-xs p-1" style={{ color: cycle.color }}>{cycle.name}</div></div>)})}</div>
            <div className="relative z-10 pt-2 space-y-1">{Object.keys(groupedTasks).map(group => (<div key={group}><div className="sticky top-16 z-10 flex items-center h-10 bg-white/80 backdrop-blur-sm border-y cursor-pointer" onClick={() => toggleGroup(group)}><div className="flex items-center gap-2 p-2"><ChevronsUpDown size={16} className={`transition-transform ${collapsedGroups[group] ? '-rotate-90' : ''}`} /><h3 className="font-bold">{group}</h3></div></div>{!collapsedGroups[group] && <div className="py-2 space-y-2">{groupedTasks[group].map(task => { const startOffset = (new Date(task.startDate).getTime() - viewStartDate.getTime()) / 86400000; const duration = Math.max(1, (new Date(task.endDate).getTime() - new Date(task.startDate).getTime()) / 86400000 + 1); const left = startOffset * dayWidth; const width = duration * dayWidth - 4; const progress = calculateTaskProgress(task); const isBlocked = task.status === 'Bloqueado'; return (<div key={task.id} className="h-10 flex items-center px-2" style={{ paddingLeft: `${left}px` }}><div onClick={() => onTaskClick(task)} title={task.title} className="h-full rounded-lg shadow-md hover:shadow-lg transition-all group flex items-center overflow-hidden relative cursor-pointer" style={{ width: `${width}px`, backgroundColor: isBlocked ? '#fee2e2' : (task.customColor || '#e5e7eb') }}><div className="absolute top-0 left-0 h-full" style={{ width: `${progress}%`, backgroundColor: isBlocked ? '#ef4444' : (task.customColor ? `${task.customColor}99` : '#6366f1') }}></div><div className="relative z-10 flex items-center gap-2 px-2 w-full">{isBlocked && <Lock size={12} className="text-red-700 flex-shrink-0" />}<p className={`text-sm font-semibold truncate ${isBlocked ? 'text-red-800' : 'text-gray-800'}`}>{task.title}</p></div></div></div>); })}</div>}</div>))}</div>
        </div></div></div>
    );
};

// --- Componente Principal da Aplicação ---
const AppCore = ({ user, onLogout }) => {
    const [appId] = useState('general-control');
    const [tasks, setTasks] = useState([]);
    const [okrs, setOkrs] = useState([]);
    const [cycles, setCycles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('workspace');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isCyclesModalOpen, setIsCyclesModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(5);
    const [viewStartDate, setViewStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 15); return d; });

    useEffect(() => {
        if (!user) return;
        const userId = user.uid;
        const paths = {
            tasks: `artifacts/${appId}/users/${userId}/roadmap_tasks`,
            okrs: `artifacts/${appId}/users/${userId}/okrs`,
            cycles: `artifacts/${appId}/users/${userId}/cycles`
        };
        const unsubTasks = onSnapshot(query(collection(db, paths.tasks)), snap => { setTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoading(false); });
        const unsubOkrs = onSnapshot(query(collection(db, paths.okrs)), snap => setOkrs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        const unsubCycles = onSnapshot(query(collection(db, paths.cycles)), snap => setCycles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => { unsubTasks(); unsubOkrs(); unsubCycles(); };
    }, [user, appId]);

    const handleSaveTask = async (taskData) => {
        if (!user) return;
        const { id, ...data } = taskData;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/roadmap_tasks`;
        if (id) { await updateDoc(doc(db, collectionPath, id), data); } 
        else { await addDoc(collection(db, collectionPath), { ...data, createdAt: serverTimestamp() }); }
    };
    const handleSaveOkr = async (okrData) => {
        if (!user) return;
        const { id, ...data } = okrData;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/okrs`;
        if (id) { await updateDoc(doc(db, collectionPath, id), data); } 
        else { await addDoc(collection(db, collectionPath), { ...data, createdAt: serverTimestamp() }); }
    };
    const handleSaveCycles = async (cyclesToSave) => {
        if (!user) return;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/cycles`;
        for (const cycle of cyclesToSave) {
            const { localId, ...data } = cycle;
            if (cycle.id) { await updateDoc(doc(db, collectionPath, cycle.id), data); } 
            else { await addDoc(collection(db, collectionPath), data); }
        }
    };
    const handleDeleteCycle = async (cycleId) => {
        if (!user || !cycleId) return;
        await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/cycles`, cycleId));
    };
    const requestDelete = (id, type) => { setItemToDelete({ id, type }); setIsConfirmDeleteOpen(true); };
    const confirmDelete = async () => {
        if (!itemToDelete || !user) return;
        const { id, type } = itemToDelete;
        const collectionName = type === 'task' ? 'roadmap_tasks' : 'okrs';
        await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/${collectionName}`, id));
        setIsConfirmDeleteOpen(false);
        setItemToDelete(null);
    };
    const handleOpenTaskModal = (task = null) => { setSelectedTask(task); setIsTaskModalOpen(true); };

    if (isLoading) return <div className="flex justify-center items-center min-h-screen">Carregando workspace...</div>;

    return (
        <div className="bg-gray-50 text-gray-800 min-h-screen p-4 md:p-6 font-sans">
            <div className="max-w-full mx-auto">
                <header className="mb-6">
                    <div className="flex justify-between items-center"><h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">Norte Estratégico</h1><div className="flex items-center gap-4"><User size={16} /><span>{user.displayName || 'Usuário'}</span><Button onClick={onLogout} variant="secondary" className="!px-3 !py-2"><LogOut size={16} /></Button></div></div>
                    <div className="mt-4 flex items-center bg-gray-200 rounded-lg p-1 space-x-1 w-full md:w-auto">
                        <Button onClick={() => setView('workspace')} variant={view === 'workspace' ? 'primary' : 'secondary'} className="!shadow-md flex-1"><Layers size={16} /> Workspace</Button>
                        <Button onClick={() => setView('okr')} variant={view === 'okr' ? 'primary' : 'secondary'} className="!shadow-md flex-1"><Target size={16} /> OKRs</Button>
                        <Button onClick={() => setView('executive')} variant={view === 'executive' ? 'primary' : 'secondary'} className="!shadow-md flex-1"><Briefcase size={16} /> Painel Executivo</Button>
                    </div>
                </header>
                <main>
                    {view === 'workspace' && (
                        <div className="space-y-6">
                            <Card><div className="flex justify-between items-center gap-4"><div className="flex gap-2"><Button onClick={() => setViewStartDate(new Date(new Date().setDate(new Date().getDate() - 15)))} variant="secondary">Hoje</Button><Button onClick={() => setIsCyclesModalOpen(true)} variant="secondary"><Repeat size={16} /> Gerenciar Ciclos</Button></div><div className="flex items-center gap-2"><ZoomOut size={20} /><input type="range" min="1" max="10" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} /><ZoomIn size={20} /></div></div></Card>
                            <ModernTimeline tasks={tasks} cycles={cycles} onTaskClick={handleOpenTaskModal} zoomLevel={zoomLevel} viewStartDate={viewStartDate} />
                            <div className="mt-6 flex justify-end"><Button onClick={() => handleOpenTaskModal()}><Plus size={20} /> Nova Tarefa</Button></div>
                        </div>
                    )}
                    {view === 'okr' && <OkrView okrs={okrs} onSave={handleSaveOkr} onDelete={requestDelete} />}
                    {view === 'executive' && <ExecutiveView tasks={tasks} okrs={okrs} />}
                </main>
                <TaskModal isOpen={isTaskModalOpen} onClose={() => setIsTaskModalOpen(false)} task={selectedTask} tasks={tasks} okrs={okrs} onSave={handleSaveTask} onDeleteRequest={requestDelete} />
                <CyclesModal isOpen={isCyclesModalOpen} onClose={() => setIsCyclesModalOpen(false)} cycles={cycles} onSave={handleSaveCycles} onDelete={handleDeleteCycle} />
                <ConfirmModal isOpen={isConfirmDeleteOpen} onClose={() => setIsConfirmDeleteOpen(false)} onConfirm={confirmDelete} title="Confirmar Exclusão"><p>Tem certeza? A exclusão é permanente.</p></ConfirmModal>
            </div>
        </div>
    );
};

// --- Componente Raiz que Gerencia a Rota ---
export default function App() {
    const [user, setUser] = useState(null);
    const [authStatus, setAuthStatus] = useState('loading');
    const [page, setPage] = useState('landing');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setAuthStatus('authenticated');
                setPage('app');
            } else {
                setUser(null);
                setAuthStatus('unauthenticated');
                setPage('landing');
            }
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = () => signOut(auth);

    if (authStatus === 'loading') return <div className="flex justify-center items-center min-h-screen">Carregando...</div>;

    switch (page) {
        case 'login': return <LoginScreen onLoginSuccess={() => setPage('app')} />;
        case 'app': return user ? <AppCore user={user} onLogout={handleLogout} /> : <LoginScreen onLoginSuccess={() => setPage('app')} />;
        default: return <LandingPage onLoginClick={() => setPage('login')} />;
    }
}
