import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, serverTimestamp } from 'firebase/firestore';
import { Target, Layers, Briefcase, Edit, Plus, Trash2, X, Tag, TrendingUp, Calendar, ListTodo, ZoomIn, ZoomOut, ChevronsUpDown, CheckCircle, MoreVertical, History, Check, Zap, ChevronDown, LayoutGrid, List, AlertTriangle, Clock, TrendingUp as TrendingUpIcon, Lock, LogOut, User, ArrowRight, Repeat, Sparkles, ShieldCheck, BarChart3 } from 'lucide-react';

// --- Configuração do Firebase ---
// Suas chaves de configuração permanecem as mesmas.
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
  const options = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC' // Usar UTC para consistência
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
};

// --- Funções de Cálculo (sem alterações na lógica principal) ---
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
const calculateOkrStatus = (startDate, targetDate, currentProgress) => {
    if (!startDate || !targetDate) return { status: 'no-date', text: 'Sem data alvo', color: 'bg-gray-400' };
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

// --- Componentes de UI Genéricos ---
const Card = ({ children, className = '', ...props }) => (
    <div className={`bg-white border border-gray-200/80 rounded-xl p-6 shadow-sm ${className}`} {...props}>
        {children}
    </div>
);
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

// --- [NOVO] Componente da Landing Page ---
const LandingPage = ({ onLoginClick }) => {
    const Feature = ({ icon, title, children }) => (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-center gap-4 mb-3">
                <div className="bg-indigo-100 text-indigo-600 p-3 rounded-full">{icon}</div>
                <h3 className="text-xl font-bold text-gray-800">{title}</h3>
            </div>
            <p className="text-gray-600">{children}</p>
        </div>
    );

    return (
        <div className="bg-gray-50 font-sans">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-40 border-b border-gray-200">
                <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">Norte Estratégico</h1>
                    <Button onClick={onLoginClick}>Acessar Plataforma</Button>
                </div>
            </header>

            {/* Hero Section */}
            <main className="container mx-auto px-6 py-20 md:py-32 text-center">
                <h2 className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-tight">
                    Transforme <span className="text-indigo-600">Estratégia</span> em <span className="text-cyan-500">Resultados</span>
                </h2>
                <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
                    Norte Estratégico é a plataforma definitiva para gestão de OKRs e Roadmaps. Alinhe suas equipes, acompanhe o progresso em tempo real e alcance seus objetivos mais ambiciosos com clareza e foco.
                </p>
                <div className="mt-10">
                    <Button onClick={onLoginClick} className="!px-8 !py-4 !text-lg">Comece a usar agora</Button>
                </div>
            </main>

            {/* Features Section */}
            <section id="features" className="bg-white py-20">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-gray-800">Tudo que você precisa para uma gestão de alta performance</h2>
                        <p className="text-gray-600 mt-2">Funcionalidades pensadas para o sucesso do seu negócio.</p>
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <Feature icon={<Target size={24} />} title="Gestão de OKRs">
                            Defina objetivos claros e mensure o sucesso com resultados-chave. Acompanhe o progresso e mantenha todos na mesma página.
                        </Feature>
                        <Feature icon={<Layers size={24} />} title="Roadmap Visual e Moderno">
                            Planeje suas entregas em uma timeline interativa. Visualize dependências, status e o andamento de cada projeto de forma intuitiva.
                        </Feature>
                        <Feature icon={<Repeat size={24} />} title="Ciclos de Trabalho">
                            Organize seu trabalho em Sprints, PIs ou trimestres. Tenha uma visão clara do que precisa ser feito em cada ciclo e melhore sua previsibilidade.
                        </Feature>
                        <Feature icon={<Briefcase size={24} />} title="Painel Executivo">
                            Relatórios e dashboards inteligentes que fornecem uma visão consolidada do progresso, riscos e pontos de atenção para a liderança.
                        </Feature>
                        <Feature icon={<BarChart3 size={24} />} title="Ritmo e Progresso">
                            Nossa plataforma calcula automaticamente o ritmo necessário para atingir suas metas, mostrando se você está adiantado, no ritmo ou em risco.
                        </Feature>
                        <Feature icon={<ShieldCheck size={24} />} title="Seguro e Confiável">
                            Construído sobre a infraestrutura do Google, seus dados estão sempre seguros e acessíveis.
                        </Feature>
                    </div>
                </div>
            </section>
            
            {/* Footer */}
            <footer className="bg-gray-800 text-white py-8">
                <div className="container mx-auto px-6 text-center">
                    <p>&copy; {new Date().getFullYear()} Norte Estratégico. Todos os direitos reservados.</p>
                </div>
            </footer>
        </div>
    );
};

// --- [NOVO e MELHORADO] Componente de Login ---
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
            if (isLoginView) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName: name });
            }
            onLoginSuccess(); // Notifica o componente pai sobre o sucesso
        } catch (err) {
            switch (err.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    setError('E-mail ou senha inválidos.');
                    break;
                case 'auth/email-already-in-use':
                    setError('Este e-mail já está em uso.');
                    break;
                case 'auth/weak-password':
                    setError('A senha deve ter no mínimo 6 caracteres.');
                    break;
                default:
                    setError('Ocorreu um erro. Tente novamente.');
                    break;
            }
            console.error("Auth Error:", err);
        }
    };

    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            onLoginSuccess();
        } catch (error) {
            setError('Falha no login com Google. Verifique as configurações do Firebase.');
            console.error("Google Auth Error:", error);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="p-8 bg-white rounded-2xl shadow-xl max-w-md w-full">
                <h1 className="text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500 mb-2">
                    Norte Estratégico
                </h1>
                <p className="text-center text-gray-600 mb-6">Seu planejamento em um só lugar.</p>
                
                <div className="flex border-b mb-6">
                    <button onClick={() => { setIsLoginView(true); setError(''); }} className={`flex-1 py-2 font-semibold transition-colors ${isLoginView ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Entrar</button>
                    <button onClick={() => { setIsLoginView(false); setError(''); }} className={`flex-1 py-2 font-semibold transition-colors ${!isLoginView ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Registrar-se</button>
                </div>
                
                <form onSubmit={handleAuthAction} className="space-y-4">
                    {!isLoginView && (
                        <input type="text" placeholder="Nome Completo" value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-3 border rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                    )}
                    <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                    <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                    
                    <Button type="submit" variant="primary" className="w-full !py-3 !text-lg">
                        {isLoginView ? 'Entrar' : 'Criar Conta'}
                    </Button>
                </form>

                <div className="my-6 flex items-center"><div className="flex-grow border-t"></div><span className="mx-4 text-gray-400">ou</span><div className="flex-grow border-t"></div></div>
                
                <Button onClick={handleGoogleLogin} variant="secondary" className="w-full !py-3">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>
                    Continuar com Google
                </Button>

                {error && <p className="mt-4 text-sm text-red-600 bg-red-100 p-3 rounded-lg text-center">{error}</p>}
            </div>
        </div>
    );
};

// --- [NOVO] Modal de Gestão de Ciclos ---
const CyclesModal = ({ isOpen, onClose, cycles, onSave, onDelete }) => {
    const [localCycles, setLocalCycles] = useState([]);

    useEffect(() => {
        if (isOpen) {
            // Clona os ciclos para edição local, garantindo que tenham ID
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
        // Se o ciclo já existe no banco (tem um 'id'), chama a função de delete
        if (cycleToRemove.id) {
            onDelete(cycleToRemove.id);
        }
        // Remove da lista local para a UI atualizar imediatamente
        setLocalCycles(localCycles.filter(c => c.localId !== cycleToRemove.localId));
    };

    const handleSaveAll = () => {
        // Filtra ciclos que têm nome para não salvar ciclos vazios
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
                        <div key={cycle.localId} className="p-4 bg-gray-50 rounded-lg border flex flex-col md:flex-row gap-4">
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

// --- [MELHORADO] Componente do Roadmap (Timeline) ---
const ModernTimeline = ({ tasks, cycles, onTaskClick, zoomLevel, viewStartDate }) => {
    // Lógica interna permanece similar, mas com melhorias visuais e de performance
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const dayWidth = useMemo(() => 20 + (zoomLevel * 5), [zoomLevel]);

    const { days, timelineWidth, headerGroups, todayPosition } = useMemo(() => {
        const allEndDates = [...tasks.map(t => t.endDate), ...cycles.map(c => c.endDate)];
        const maxEndDate = allEndDates.length > 0
            ? new Date(Math.max.apply(null, allEndDates.filter(Boolean).map(d => new Date(d).getTime())))
            : null;

        const timelineEndDate = new Date(viewStartDate);
        timelineEndDate.setDate(timelineEndDate.getDate() + 60); // Default view range
        if (maxEndDate && maxEndDate > timelineEndDate) {
            timelineEndDate.setDate(maxEndDate.getDate() + 15);
        }

        const daysInView = [];
        let current = new Date(viewStartDate);
        while (current <= timelineEndDate) {
            daysInView.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }

        const width = daysInView.length * dayWidth;
        const todayPos = (today.getTime() - new Date(viewStartDate).getTime()) / (1000 * 60 * 60 * 24) * dayWidth;

        // Lógica de agrupamento de header (simplificada para clareza)
        const groups = daysInView.map(day => ({
            key: day.toISOString(),
            label: day.getDate(),
            subLabel: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(day),
            isToday: day.toDateString() === today.toDateString()
        }));

        return { days: daysInView, timelineWidth: width, headerGroups: groups, todayPosition: todayPos };
    }, [viewStartDate, dayWidth, tasks, cycles]);

    const groupedTasks = useMemo(() => {
        const groups = tasks.reduce((acc, task) => {
            const group = task.projectTag || 'Sem Projeto';
            if (!acc[group]) acc[group] = [];
            acc[group].push(task);
            return acc;
        }, {});
        // Ordena os projetos
        return Object.keys(groups).sort().reduce((obj, key) => { 
            obj[key] = groups[key]; 
            return obj;
        }, {});
    }, [tasks]);

    const [collapsedGroups, setCollapsedGroups] = useState({});
    const toggleGroup = (group) => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));

    return (
        <div className="bg-white border border-gray-200/80 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <div style={{ width: timelineWidth }} className="relative">
                    {/* Header */}
                    <div className="sticky top-0 z-20 bg-gray-50/70 backdrop-blur-sm h-16 border-b">
                        <div className="flex">
                            {headerGroups.map(group => (
                                <div key={group.key} className={`flex-shrink-0 text-center font-semibold border-r py-1 flex flex-col justify-center items-center ${group.isToday ? 'bg-indigo-100' : ''}`} style={{ width: dayWidth }}>
                                    <span className={`text-xs ${group.isToday ? 'text-indigo-600' : 'text-gray-500'}`}>{group.subLabel}</span>
                                    <span className={`text-lg ${group.isToday ? 'text-indigo-600 font-bold' : 'text-gray-700'}`}>{group.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Grid e Ciclos */}
                    <div className="absolute top-0 left-0 w-full h-full z-0">
                        {days.map((day, index) => (<div key={index} className={`h-full border-r ${day.getUTCDay() === 0 || day.getUTCDay() === 6 ? 'bg-gray-50/50' : 'border-gray-100'}`} style={{ width: dayWidth }}></div>))}
                        {todayPosition >= 0 && todayPosition <= timelineWidth && (<div className="absolute top-0 h-full w-0.5 bg-red-500 z-10" style={{ left: todayPosition }}><div className="absolute -top-1 -translate-x-1/2 left-1/2 bg-red-500 rounded-full w-2 h-2"></div></div>)}
                        {cycles.map(cycle => {
                             const cycleStart = new Date(cycle.startDate);
                             const cycleEnd = new Date(cycle.endDate);
                             const startOffset = (cycleStart.getTime() - viewStartDate.getTime()) / (1000 * 60 * 60 * 24);
                             const duration = Math.max(1, (cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24) + 1);
                             return (
                                <div key={cycle.id} className="absolute top-16 bottom-0 z-0" style={{ left: `${startOffset * dayWidth}px`, width: `${duration * dayWidth}px` }}>
                                    <div className="h-full w-full border-x" style={{ backgroundColor: cycle.color, opacity: 0.15, borderColor: cycle.color }}></div>
                                    <div className="absolute -top-0.5 left-0 w-full font-bold text-center text-xs p-1" style={{ color: cycle.color }}>{cycle.name}</div>
                                </div>
                             )
                        })}
                    </div>

                    {/* Tarefas */}
                    <div className="relative z-10 pt-2 space-y-1">
                        {Object.keys(groupedTasks).map(group => (
                            <div key={group}>
                                <div className="sticky top-16 z-10 flex items-center h-10 bg-white/80 backdrop-blur-sm border-y cursor-pointer" onClick={() => toggleGroup(group)}>
                                    <div className="flex items-center gap-2 p-2"><ChevronsUpDown size={16} className={`transition-transform ${collapsedGroups[group] ? '-rotate-90' : ''}`} /><h3 className="font-bold text-gray-800">{group}</h3></div>
                                </div>
                                {!collapsedGroups[group] && (
                                    <div className="py-2 space-y-2">
                                        {groupedTasks[group].map(task => {
                                            const taskStart = new Date(task.startDate);
                                            const taskEnd = new Date(task.endDate);
                                            const startOffset = (taskStart.getTime() - viewStartDate.getTime()) / (1000 * 60 * 60 * 24);
                                            const duration = Math.max(1, (taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24) + 1);
                                            const left = startOffset * dayWidth;
                                            const width = duration * dayWidth - 4;
                                            const progress = calculateTaskProgress(task);
                                            const isBlocked = task.status === 'Bloqueado';

                                            return (
                                                <div key={task.id} className="h-10 flex items-center px-2" style={{ paddingLeft: `${left}px` }}>
                                                    <div onClick={() => onTaskClick(task)} title={task.title} className="h-full rounded-lg shadow-md hover:shadow-lg transition-all duration-200 group flex items-center overflow-hidden relative cursor-pointer" style={{ width: `${width}px`, backgroundColor: isBlocked ? '#fee2e2' : (task.customColor || '#e5e7eb') }}>
                                                        <div className="absolute top-0 left-0 h-full" style={{ width: `${progress}%`, backgroundColor: isBlocked ? '#ef4444' : (task.customColor ? `${task.customColor}99` : '#6366f1') }}></div>
                                                        <div className="relative z-10 flex items-center gap-2 px-2 w-full">
                                                            {isBlocked && <Lock size={12} className="text-red-700 flex-shrink-0" />}
                                                            <p className={`text-sm font-semibold truncate ${isBlocked ? 'text-red-800' : 'text-gray-800'}`}>{task.title}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Componente da Aplicação Principal ---
const AppCore = ({ user, onLogout }) => {
    // State e lógica da aplicação principal...
    const [appId] = useState('general-control');
    const [tasks, setTasks] = useState([]);
    const [okrs, setOkrs] = useState([]);
    const [cycles, setCycles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('okr');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isCyclesModalOpen, setIsCyclesModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(5);
    const [viewStartDate, setViewStartDate] = useState(() => {
        const date = new Date(); date.setDate(date.getDate() - 15); return date;
    });

    // Hooks para carregar dados do Firebase...
    useEffect(() => {
        if (!user) return;
        const userId = user.uid;
        const paths = {
            tasks: `artifacts/${appId}/users/${userId}/roadmap_tasks`,
            okrs: `artifacts/${appId}/users/${userId}/okrs`,
            cycles: `artifacts/${appId}/users/${userId}/cycles`
        };

        const unsubTasks = onSnapshot(query(collection(db, paths.tasks)), snap => {
            setTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoading(false);
        });
        const unsubOkrs = onSnapshot(query(collection(db, paths.okrs)), snap => {
            setOkrs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const unsubCycles = onSnapshot(query(collection(db, paths.cycles)), snap => {
            setCycles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => { unsubTasks(); unsubOkrs(); unsubCycles(); };
    }, [user, appId]);

    // Funções de CRUD (Save/Delete)...
    const handleSaveTask = async (taskData) => { /* ...lógica original... */ };
    const handleSaveOkr = async (okrData) => { /* ...lógica original... */ };
    
    const handleSaveCycles = async (cyclesToSave) => {
        if (!user) return;
        const collectionPath = `artifacts/${appId}/users/${user.uid}/cycles`;
        
        for (const cycle of cyclesToSave) {
            // Separa o ID local do resto dos dados
            const { localId, ...data } = cycle;
            if (cycle.id) { // Se tem 'id', é um update
                await updateDoc(doc(db, collectionPath, cycle.id), data);
            } else { // Senão, é um novo documento
                await addDoc(collection(db, collectionPath), data);
            }
        }
    };
    
    const handleDeleteCycle = async (cycleId) => {
        if (!user || !cycleId) return;
        await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/cycles`, cycleId));
    };

    const handleOpenTaskModal = (task = null) => {
        setSelectedTask(task);
        setIsTaskModalOpen(true);
    };

    if (isLoading) {
        return <div className="flex justify-center items-center min-h-screen bg-gray-50"><p className="text-lg text-gray-600">Carregando seu workspace...</p></div>
    }

    return (
        <div className="bg-gray-50 text-gray-800 min-h-screen p-4 md:p-6 font-sans">
            <div className="max-w-full mx-auto">
                <header className="mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">Norte Estratégico</h1>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-sm text-gray-700"><User size={16} /><span>{user.displayName || 'Usuário'}</span></div>
                            <Button onClick={onLogout} variant="secondary" className="!px-3 !py-2"><LogOut size={16} /></Button>
                        </div>
                    </div>
                     <div className="mt-4 flex items-center bg-gray-200 rounded-lg p-1 space-x-1 w-full md:w-auto">
                        <Button onClick={() => setView('workspace')} variant={view === 'workspace' ? 'primary' : 'secondary'} className="!shadow-md flex-1 md:flex-none"><Layers size={16} /> Workspace</Button>
                        <Button onClick={() => setView('okr')} variant={view === 'okr' ? 'primary' : 'secondary'} className="!shadow-md flex-1 md:flex-none"><Target size={16} /> OKRs</Button>
                        <Button onClick={() => setView('executive')} variant={view === 'executive' ? 'primary' : 'secondary'} className="!shadow-md flex-1 md:flex-none"><Briefcase size={16} /> Painel Executivo</Button>
                    </div>
                </header>
                <main>
                    {view === 'workspace' && (
                        <div className="space-y-6">
                            <Card>
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                        <Button onClick={() => setViewStartDate(new Date(new Date().setDate(new Date().getDate() - 15)))} variant="secondary">Hoje</Button>
                                        <Button onClick={() => setIsCyclesModalOpen(true)} variant="secondary"><Repeat size={16} /> Gerenciar Ciclos</Button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ZoomOut size={20} /><input type="range" min="1" max="10" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} className="w-24" /><ZoomIn size={20} />
                                    </div>
                                </div>
                            </Card>
                            <ModernTimeline tasks={tasks} cycles={cycles} onTaskClick={handleOpenTaskModal} zoomLevel={zoomLevel} viewStartDate={viewStartDate} />
                            <div className="mt-6 flex justify-end"><Button onClick={() => handleOpenTaskModal()}><Plus size={20} /> Nova Tarefa</Button></div>
                        </div>
                    )}
                    {/* As outras views (OKR, Executive) podem ser inseridas aqui, usando os componentes já existentes */}
                </main>

                {/* Modais */}
                <CyclesModal isOpen={isCyclesModalOpen} onClose={() => setIsCyclesModalOpen(false)} cycles={cycles} onSave={handleSaveCycles} onDelete={handleDeleteCycle} />
                {/* Outros modais (TaskModal, ConfirmModal, etc.) */}
            </div>
        </div>
    );
};

// --- Componente Raiz que Gerencia a Rota ---
export default function App() {
    const [user, setUser] = useState(null);
    const [authStatus, setAuthStatus] = useState('loading'); // 'loading', 'unauthenticated', 'authenticated'
    const [page, setPage] = useState('landing'); // 'landing', 'login', 'app'

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setAuthStatus('authenticated');
                setPage('app'); // Se já está logado, vai direto para o app
            } else {
                setUser(null);
                setAuthStatus('unauthenticated');
                // Permanece na landing page por padrão, ou vai para o login se o usuário clicar
            }
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = () => {
        signOut(auth).then(() => {
            setPage('landing'); // Volta para a landing page ao deslogar
        });
    };

    if (authStatus === 'loading') {
        return <div className="flex justify-center items-center min-h-screen">Carregando...</div>;
    }

    switch (page) {
        case 'login':
            return <LoginScreen onLoginSuccess={() => setPage('app')} />;
        case 'app':
            // Se por algum motivo chegou aqui sem usuário, redireciona
            if (!user) return <LoginScreen onLoginSuccess={() => setPage('app')} />;
            return <AppCore user={user} onLogout={handleLogout} />;
        case 'landing':
        default:
            return <LandingPage onLoginClick={() => setPage('login')} />;
    }
}
