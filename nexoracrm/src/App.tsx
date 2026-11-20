import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Briefcase, CalendarCheck,
  CalendarDays, BarChart3, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, CircleCheck, Clock3, Contact as ContactIcon, Download, Ellipsis, FileText,
  LayoutDashboard, ListChecks, LockKeyhole, LogOut, Mail, Menu, MoreHorizontal,
  Plus, Search, Settings, Sparkles, Target, Trash2, TrendingUp, Users, Wallet, X,
} from 'lucide-react';
import { api, ApiError } from './lib/api';
import type { Activity as ActivityItem, Contact, DashboardData, Deal, ReportsData, Role, Task, User } from './types';

type Page = 'dashboard' | 'contacts' | 'deals' | 'tasks' | 'calendar' | 'reports' | 'team';
type ModalState = { kind: 'contact' | 'deal' | 'task' | 'team'; item?: Contact | Deal | Task } | null;
type ToastState = { message: string; kind: 'success' | 'error' } | null;

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard, group: 'Рабочее пространство' },
  { id: 'contacts', label: 'Контакты', icon: ContactIcon, group: 'Рабочее пространство' },
  { id: 'deals', label: 'Сделки', icon: Briefcase, group: 'Рабочее пространство' },
  { id: 'tasks', label: 'Задачи', icon: ListChecks, group: 'Рабочее пространство' },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays, group: 'Планирование' },
  { id: 'reports', label: 'Отчёты', icon: FileText, group: 'Аналитика' },
  { id: 'team', label: 'Команда', icon: Users, group: 'Управление' },
];
const stageLabels: Record<string, string> = { lead: 'Новая', qualified: 'Квалификация', proposal: 'Предложение', negotiation: 'Переговоры', won: 'Успешно', lost: 'Отказ' };
const statusLabels: Record<string, string> = { lead: 'Лид', active: 'В работе', customer: 'Клиент' };
const roleLabels: Record<Role, string> = { admin: 'Администратор', manager: 'Руководитель', sales: 'Менеджер' };
const priorityLabels: Record<string, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
const stageOrder = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const currency = (value: number, compact = false) => new Intl.NumberFormat('ru-RU', compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(value) + ' ₽';
const dateShort = (value?: string | null) => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(value)) : '—';
const dateLong = (value?: string | null) => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)) : '—';
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const monthLabel = (value: string) => { const [y,m] = value.split('-').map(Number); return new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(y, m - 1, 1)).replace('.', ''); };
const localDateTime = (date = new Date()) => { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0,16); };

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState<Page>('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [team, setTeam] = useState<User[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [loginEmail, setLoginEmail] = useState('admin@nexora.local');
  const [loginPassword, setLoginPassword] = useState('Nexora2026!');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    api<{user: User}>('/auth/me').then(result => setUser(result.user)).catch(() => setUser(null)).finally(() => setAuthLoading(false));
  }, []);

  const loadPage = useCallback(async (target: Page = page) => {
    setPageLoading(true);
    try {
      if (target === 'dashboard') setDashboard(await api<DashboardData>('/dashboard'));
      if (target === 'contacts') setContacts((await api<{contacts: Contact[]}>('/contacts')).contacts);
      if (target === 'deals') {
        const [dealData, contactData] = await Promise.all([api<{deals: Deal[]}>('/deals'), api<{contacts: Contact[]}>('/contacts')]);
        setDeals(dealData.deals); setContacts(contactData.contacts);
      }
      if (target === 'tasks' || target === 'calendar') {
        const [taskData, contactData] = await Promise.all([api<{tasks: Task[]}>('/tasks'), api<{contacts: Contact[]}>('/contacts')]);
        setTasks(taskData.tasks); setContacts(contactData.contacts);
      }
      if (target === 'dashboard') setContacts((await api<{contacts: Contact[]}>('/contacts')).contacts);
      if (target === 'reports') setReports(await api<ReportsData>('/reports'));
      if (target === 'team' && (user?.role === 'admin' || user?.role === 'manager')) setTeam((await api<{users: User[]}>('/team')).users);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setUser(null);
      else notify(error instanceof Error ? error.message : 'Не удалось загрузить данные', 'error');
    } finally { setPageLoading(false); }
  }, [page, user, notify]);

  useEffect(() => { if (user) loadPage(page); }, [user, page, loadPage]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoginError(''); setLoginBusy(true);
    try { const result = await api<{user: User}>('/auth/login', { method: 'POST', body: JSON.stringify({ email: loginEmail, password: loginPassword }) }); setUser(result.user); setPage('dashboard'); }
    catch (error) { setLoginError(error instanceof Error ? error.message : 'Не удалось войти'); }
    finally { setLoginBusy(false); }
  };
  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ } setUser(null); setPage('dashboard'); };
  const goTo = (target: Page) => { if (target === 'team' && user?.role === 'sales') { notify('Раздел команды доступен руководителям', 'error'); return; } setPage(target); setSearch(''); setMobileNav(false); };

  const saveModal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const get = (key: string) => String(data.get(key) || '').trim();
    try {
      if (modal?.kind === 'contact') {
        const body = { name:get('name'), company:get('company'), email:get('email'), phone:get('phone'), source:get('source'), status:get('status'), value:Number(get('value')||0), tags:get('tags').split(',').map(v=>v.trim()).filter(Boolean) };
        if (modal.item) await api(`/contacts/${modal.item.id}`, { method:'PUT', body:JSON.stringify(body) });
        else await api('/contacts', { method:'POST', body:JSON.stringify(body) });
      }
      if (modal?.kind === 'deal') {
        const body = { title:get('title'), company:get('company'), contact_id:get('contact_id')||null, value:Number(get('value')||0), stage:get('stage'), probability:Number(get('probability')||10), close_date:get('close_date')||null };
        await api('/deals', { method:'POST', body:JSON.stringify(body) });
      }
      if (modal?.kind === 'task') {
        const body = { title:get('title'), description:get('description'), due_date:new Date(get('due_date')).toISOString(), priority:get('priority'), related_contact_id:get('related_contact_id')||null };
        await api('/tasks', { method:'POST', body:JSON.stringify(body) });
      }
      if (modal?.kind === 'team') {
        const body = { name:get('name'), email:get('email'), password:get('password'), role:get('role') };
        await api('/team', { method:'POST', body:JSON.stringify(body) });
      }
      setModal(null); notify('Изменения сохранены'); await loadPage(page);
    } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось сохранить', 'error'); }
  };

  const changeDealStage = async (deal: Deal, stage: string) => {
    try { await api(`/deals/${deal.id}`, { method:'PATCH', body:JSON.stringify({ stage }) }); await loadPage('deals'); notify('Этап сделки обновлён'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось изменить сделку','error'); }
  };
  const updateTask = async (task: Task, patch: Partial<Task>) => {
    try { await api(`/tasks/${task.id}`, { method:'PATCH', body:JSON.stringify(patch) }); await loadPage(page); notify('Задача обновлена'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось обновить задачу','error'); }
  };
  const deleteItem = async (type: 'contacts'|'deals'|'tasks', id: number, label: string) => {
    if (!window.confirm(`Удалить «${label}»? Это действие нельзя отменить.`)) return;
    try { await api(`/${type}/${id}`, { method:'DELETE' }); await loadPage(page); notify('Запись удалена'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось удалить запись','error'); }
  };
  const toggleTeamMember = async (member: User) => {
    try { await api(`/team/${member.id}`, { method:'PATCH', body:JSON.stringify({ is_active: member.is_active ? 0 : 1 }) }); await loadPage('team'); notify('Статус сотрудника обновлён'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось обновить сотрудника','error'); }
  };

  if (authLoading) return <div className="splash"><div className="brand-mark"><Sparkles size={20}/></div><span>NEXORA</span><div className="loading-line"/></div>;
  if (!user) return <Login email={loginEmail} setEmail={setLoginEmail} password={loginPassword} setPassword={setLoginPassword} error={loginError} busy={loginBusy} onSubmit={handleLogin}/>;

  const current = navItems.find(item => item.id === page);
  const filteredContacts = contacts.filter(contact => [contact.name,contact.company,contact.email,contact.phone].join(' ').toLowerCase().includes(search.toLowerCase()));
  const filteredDeals = deals.filter(deal => [deal.title,deal.company,deal.contact_name].join(' ').toLowerCase().includes(search.toLowerCase()));
  const filteredTasks = tasks.filter(task => [task.title,task.description,task.contact_name].join(' ').toLowerCase().includes(search.toLowerCase()));

  return <div className="app-shell">
    {mobileNav && <button className="mobile-scrim" aria-label="Закрыть меню" onClick={()=>setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}>
      <div className="brand-lockup"><div className="brand-mark"><Sparkles size={20}/></div><div><b>NEXORA</b><span>CRM WORKSPACE</span></div><button className="sidebar-close icon-button" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">N</div><div className="workspace-meta"><b>Nexora Studio</b><span>Рабочее пространство</span></div><ChevronDown size={15}/></div>
      <nav className="side-nav">
        {['Рабочее пространство','Планирование','Аналитика','Управление'].map(group => <div className="nav-group" key={group}>
          <div className="nav-caption">{group}</div>
          {navItems.filter(item => item.group===group && (item.id!=='team'||user.role!=='sales')).map(item => <button key={item.id} className={`nav-link ${page===item.id?'active':''}`} onClick={()=>goTo(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.id==='tasks'&&tasks.filter(t=>t.status!=='done').length>0&&<em>{tasks.filter(t=>t.status!=='done').length}</em>}</button>)}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={16}/></div><b>Работайте умнее</b><p>Все процессы команды — в одном месте.</p><button onClick={()=>goTo('reports')}>Открыть аналитику <ArrowRight size={14}/></button></div>
        <div className="sidebar-profile"><Avatar name={user.name} color="violet"/><div className="profile-meta"><b>{user.name}</b><span>{roleLabels[user.role]}</span></div><button className="icon-button profile-logout" title="Выйти" onClick={logout}><LogOut size={16}/></button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(true)}><Menu size={20}/></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><b>{current?.label||'Обзор'}</b></div></div>
        <div className="topbar-actions"><label className="global-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по разделу..."/><kbd>⌘ K</kbd></label><button className="icon-button notification-button" title="Уведомления" onClick={()=>notify('Новых уведомлений пока нет')}><Bell size={18}/><i/></button><div className="topbar-divider"/><button className="topbar-user" onClick={logout} title="Выйти из аккаунта" aria-label="Выйти из аккаунта"><Avatar name={user.name} color="blue"/><span>{user.name.split(' ')[0]}</span><ChevronDown size={14}/></button></div>
      </header>

      <div className="page-wrap">
        {pageLoading && <div className="page-loading"><span/></div>}
        {page==='dashboard'&&dashboard&&<DashboardPage data={dashboard} user={user} onCreate={(kind)=>setModal({kind})} onNavigate={goTo} onTask={(task)=>updateTask(task,{status:task.status==='done'?'todo':'done'})}/>}
        {page==='contacts'&&<ContactsPage contacts={filteredContacts} search={search} onCreate={()=>setModal({kind:'contact'})} onEdit={contact=>setModal({kind:'contact',item:contact})} onDelete={contact=>deleteItem('contacts',contact.id,contact.name)}/>}
        {page==='deals'&&<DealsPage deals={filteredDeals} onCreate={()=>setModal({kind:'deal'})} onStage={changeDealStage} onDelete={deal=>deleteItem('deals',deal.id,deal.title)}/>}
        {page==='tasks'&&<TasksPage tasks={filteredTasks} onCreate={()=>setModal({kind:'task'})} onUpdate={updateTask} onDelete={task=>deleteItem('tasks',task.id,task.title)}/>}
        {page==='calendar'&&<CalendarPage tasks={tasks} date={calendarDate} setDate={setCalendarDate} onCreate={()=>setModal({kind:'task'})} onTask={task=>updateTask(task,{status:task.status==='done'?'todo':'done'})}/>}
        {page==='reports'&&reports&&<ReportsPage reports={reports}/>}
        {page==='team'&&<TeamPage team={team} currentUser={user} onCreate={()=>setModal({kind:'team'})} onToggle={toggleTeamMember}/>}
        {!pageLoading && page==='dashboard'&&!dashboard&&<EmptyState title="Не удалось загрузить обзор" text="Попробуйте обновить данные." action={()=>loadPage('dashboard')}/>}
      </div>
      <footer className="app-footer"><span>© 2026 NexoraCRM</span><span><i className="online-dot"/> Все системы работают</span><span>Сделано для роста <Sparkles size={12}/></span></footer>
    </main>

    {modal&&<Modal modal={modal} contacts={contacts} onClose={()=>setModal(null)} onSubmit={saveModal}/>}
    {toast&&<div className={`toast toast-${toast.kind}`}><span className="toast-icon">{toast.kind==='success'?<Check size={16}/>:<CircleAlert size={16}/>}</span>{toast.message}<button onClick={()=>setToast(null)}><X size={15}/></button></div>}
  </div>;
}

function Login({email,setEmail,password,setPassword,error,busy,onSubmit}:{email:string;setEmail:(v:string)=>void;password:string;setPassword:(v:string)=>void;error:string;busy:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}) {
  return <div className="login-layout"><div className="login-visual"><div className="login-visual-top"><div className="brand-mark"><Sparkles size={20}/></div><b>NEXORA</b><span>CRM WORKSPACE</span></div><div className="login-orbit orbit-one"/><div className="login-orbit orbit-two"/><div className="login-visual-content"><div className="eyebrow"><span/> YOUR BUSINESS, IN FOCUS</div><h1>Больше ясности.<br/><em>Меньше рутины.</em></h1><p>Единое пространство, в котором команда превращает отношения с клиентами в устойчивый рост.</p><div className="login-visual-stats"><div><b>01</b><span>Клиенты</span></div><div><b>02</b><span>Сделки</span></div><div><b>03</b><span>Результаты</span></div></div></div><div className="login-visual-bottom"><span>BUILT FOR TEAMS THAT MOVE FORWARD</span><span>© NEXORA 2026</span></div></div><div className="login-panel"><div className="login-mobile-brand"><div className="brand-mark"><Sparkles size={20}/></div><b>NEXORA</b></div><div className="login-card"><div className="login-kicker">РАБОЧЕЕ ПРОСТРАНСТВО</div><h2>С возвращением</h2><p>Войдите в аккаунт, чтобы продолжить работу.</p><form onSubmit={onSubmit}><label className="field-label">Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com"/></label><label className="field-label">Пароль<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Введите пароль"/></label>{error&&<div className="form-error"><CircleAlert size={15}/>{error}</div>}<button className="primary-button login-button" disabled={busy}>{busy?'Входим...':'Войти в Nexora'}<ArrowRight size={17}/></button></form><div className="login-demo"><div className="login-demo-icon"><LockKeyhole size={16}/></div><div><b>Демо-доступ</b><span>admin@nexora.local · Nexora2026!</span></div></div><div className="login-secure"><LockKeyhole size={13}/> Защищённая сессия · 7 дней</div></div><div className="login-panel-foot">Нет аккаунта? Обратитесь к администратору рабочего пространства.</div></div></div>;
}

function Avatar({name,color='blue',size='normal'}:{name:string;color?:string;size?:'normal'|'small'|'large'}) { return <div className={`avatar avatar-${color} avatar-${size}`}>{initials(name)}</div>; }
function PageHeading({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:ReactNode}) { return <div className="page-heading"><div><div className="section-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div className="heading-actions">{action}</div>}</div>; }
function PrimaryButton({children,onClick,icon=true}:{children:ReactNode;onClick:()=>void;icon?:boolean}) { return <button className="primary-button" onClick={onClick}>{icon&&<Plus size={17}/>} {children}</button>; }
function MetricCard({label,value,trend,trendText,icon:Icon,accent,footnote}:{label:string;value:string;trend?:string;trendText?:string;icon:typeof Wallet;accent:string;footnote:string}) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${accent}`}><Icon size={18}/></span></div><div className="metric-value">{value}</div><div className="metric-bottom">{trend&&<span className={`trend ${trend.startsWith('-')?'negative':''}`}>{trend.startsWith('-')?<ArrowDownRight size={14}/>:<ArrowUpRight size={14}/>} {trend}</span>}<span>{trendText||footnote}</span></div></div>; }
function Panel({title,subtitle,action,children,className=''}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode;className?:string}) { return <section className={`panel ${className}`}><div className="panel-heading"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>; }
function EmptyState({title,text,action}:{title:string;text:string;action?:()=>void}) { return <div className="empty-state"><div className="empty-state-icon"><Sparkles size={22}/></div><b>{title}</b><p>{text}</p>{action&&<button className="text-button" onClick={action}>Обновить <ArrowRight size={14}/></button>}</div>; }

function DashboardPage({data,user,onCreate,onNavigate,onTask}:{data:DashboardData;user:User;onCreate:(kind:'contact'|'deal'|'task'|'team')=>void;onNavigate:(page:Page)=>void;onTask:(task:Task)=>void}) {
  const revenue = data.revenue.length ? data.revenue : [{month:new Date().toISOString().slice(0,7),value:0}];
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Доброе утро' : hour < 17 ? 'Добрый день' : 'Добрый вечер';
  const todayLabel = new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date()).toUpperCase();
  const wonCount = data.stages.find(s=>s.stage==='won')?.count || 0;
  const openCount = data.stages.filter(s=>!['won','lost'].includes(s.stage)).reduce((sum,s)=>sum+s.count,0);
  return <>
    <PageHeading eyebrow={todayLabel} title={`${greeting}, ${user.name.split(' ')[0]} 👋`} subtitle="Вот что происходит в вашем бизнесе сегодня." action={<><button className="secondary-button" onClick={()=>onNavigate('reports')}><BarChart3 size={16}/> Отчёты</button><PrimaryButton onClick={()=>onCreate('deal')}>Новая сделка</PrimaryButton></>}/>
    <div className="metric-grid">
      <MetricCard label="Всего контактов" value={data.metrics.totalContacts.toLocaleString('ru-RU')} trendText={`${data.metrics.newContacts} новых за 30 дней`} icon={Users} accent="accent-violet" footnote="в базе"/>
      <MetricCard label="Открытая воронка" value={currency(data.metrics.openPipeline,true)} trendText={`${openCount} открытых сделок`} icon={Target} accent="accent-blue" footnote="потенциал"/>
      <MetricCard label="Выручка закрытых сделок" value={currency(data.metrics.wonRevenue,true)} trendText={`${wonCount} успешных сделок`} icon={Wallet} accent="accent-green" footnote="всего"/>
      <MetricCard label="Конверсия в продажу" value={`${data.metrics.winRate}%`} trendText="от закрытых сделок" icon={TrendingUp} accent="accent-orange" footnote="конверсия"/>
    </div>
    <div className="dashboard-grid dashboard-grid-main">
      <Panel title="Динамика выручки" subtitle="Закрытые сделки · последние месяцы" action={<button className="select-like" onClick={()=>onNavigate('reports')}>Подробнее <ArrowUpRight size={14}/></button>} className="revenue-panel">
        <div className="chart-legend"><span><i className="legend-dot purple-dot"/> Выручка</span><b>{currency(data.metrics.wonRevenue,true)}</b></div>
        <RevenueChart rows={revenue}/>
      </Panel>
      <Panel title="Воронка продаж" subtitle="Распределение сделок по этапам" action={<button className="more-button" onClick={()=>onNavigate('deals')}><MoreHorizontal size={19}/></button>}>
        <div className="funnel-total"><b>{currency(data.metrics.openPipeline,true)}</b><span>открытый pipeline</span></div>
        <div className="funnel-bars">{['lead','qualified','proposal','negotiation'].map((stage,index)=>{const row=data.stages.find(item=>item.stage===stage);const max=Math.max(1,...data.stages.map(item=>Number(item.value)));return <div className="funnel-row" key={stage}><div className="funnel-label"><span>{stageLabels[stage]}</span><b>{row?.count||0}</b></div><div className="funnel-track"><i style={{width:`${Math.max(3,(Number(row?.value||0)/max)*100)}%`}} className={`funnel-fill fill-${index}`}/></div></div>;})}</div>
        <button className="panel-link" onClick={()=>onNavigate('deals')}>Перейти к сделкам <ArrowRight size={14}/></button>
      </Panel>
    </div>
    <div className="dashboard-grid dashboard-grid-bottom">
      <Panel title="Последняя активность" subtitle="Что происходило в команде" action={<button className="text-button" onClick={()=>onNavigate('contacts')}>Все контакты <ArrowRight size={14}/></button>}>
        <ActivityList items={data.recentActivities}/>
      </Panel>
      <Panel title="Ближайшие задачи" subtitle="Не упустите важное" action={<button className="text-button" onClick={()=>onNavigate('tasks')}>Все задачи <ArrowRight size={14}/></button>}>
        <div className="task-preview-list">{data.upcomingTasks.slice(0,5).map(task=><div className="task-preview" key={task.id}><button className={`task-check ${task.status==='done'?'checked':''}`} onClick={()=>onTask(task)}>{task.status==='done'?<Check size={13}/>:null}</button><div className="task-preview-copy"><b>{task.title}</b><span>{task.contact_name||task.assignee_name||'Без привязки'}</span></div><div className="task-preview-date"><span className={`priority-dot priority-${task.priority}`}/>{dateShort(task.due_date)}</div></div>)}{data.upcomingTasks.length===0&&<EmptyState title="Задач пока нет" text="Создайте первую задачу, чтобы ничего не забыть."/>}</div>
      </Panel>
    </div>
    <div className="quick-actions"><div><b>Быстрый старт</b><span>Добавьте данные, чтобы наполнить рабочее пространство.</span></div><button onClick={()=>onCreate('contact')}><Users size={17}/> Добавить контакт</button><button onClick={()=>onCreate('task')}><CalendarCheck size={17}/> Создать задачу</button><button onClick={()=>onCreate('deal')}><Briefcase size={17}/> Создать сделку</button></div>
  </>;
}

function RevenueChart({rows}:{rows:{month:string;value:number}[]}) {
  const values=rows.map(row=>Number(row.value||0)); const max=Math.max(1,...values); const points=values.map((value,index)=>({x:24+index*(272/Math.max(1,values.length-1)),y:126-(value/max)*96}));
  const path=points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '); const area=`${path} L ${points[points.length-1]?.x||24} 132 L ${points[0]?.x||24} 132 Z`;
  return <div className="revenue-chart"><svg viewBox="0 0 320 156" preserveAspectRatio="none" role="img" aria-label="График выручки"><defs><linearGradient id="revenueGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8b72f6" stopOpacity=".24"/><stop offset="100%" stopColor="#8b72f6" stopOpacity="0"/></linearGradient></defs>{[30,60,90,120].map(y=><line key={y} x1="20" x2="300" y1={y} y2={y} stroke="#eef0f5" strokeDasharray="4 5"/>)}<path d={area} fill="url(#revenueGradient)"/><path d={path} fill="none" stroke="#8065ed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#8065ed" strokeWidth="2.5"/> )}</svg><div className="chart-xlabels">{rows.map(row=><span key={row.month}>{monthLabel(row.month)}</span>)}</div></div>;
}
function ActivityList({items}:{items:ActivityItem[]}) { const colors=['violet','blue','orange','green']; return <div className="activity-list">{items.map((item,index)=><div className="activity-item" key={item.id}><div className={`activity-icon activity-${colors[index%colors.length]}`}>{item.type==='deal'?<Briefcase size={15}/>:item.type==='task'?<CheckCheck size={15}/>:<Users size={15}/>}</div><div className="activity-copy"><b>{item.title}</b><span>{item.description||item.contact_name||item.user_name||'Обновление'}</span></div><time>{new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'}).format(new Date(item.created_at))}</time></div>)}{items.length===0&&<EmptyState title="Активности пока нет" text="Действия команды появятся здесь."/>}</div>; }

function ContactsPage({contacts,search,onCreate,onEdit,onDelete}:{contacts:Contact[];search:string;onCreate:()=>void;onEdit:(contact:Contact)=>void;onDelete:(contact:Contact)=>void}) {
  const [status,setStatus]=useState('all'); const [view,setView]=useState<'table'|'grid'>('table');
  const visible=contacts.filter(c=>status==='all'||c.status===status);
  return <><PageHeading eyebrow="КЛИЕНТСКАЯ БАЗА" title="Контакты" subtitle="Все люди и компании, с которыми вы строите отношения." action={<PrimaryButton onClick={onCreate}>Новый контакт</PrimaryButton>}/><div className="summary-strip"><div><span>Всего контактов</span><b>{contacts.length}</b></div><div><span>Лиды</span><b>{contacts.filter(c=>c.status==='lead').length}</b></div><div><span>В работе</span><b>{contacts.filter(c=>c.status==='active').length}</b></div><div><span>Клиенты</span><b>{contacts.filter(c=>c.status==='customer').length}</b></div></div><div className="toolbar"><div className="filter-pills">{[['all','Все'],['lead','Лиды'],['active','В работе'],['customer','Клиенты']].map(([id,label])=><button key={id} className={status===id?'selected':''} onClick={()=>setStatus(id)}>{label}</button>)}</div><div className="toolbar-right"><span className="result-count">{visible.length} записей{search?` · поиск: ${search}`:''}</span><button className={`view-toggle ${view==='table'?'selected':''}`} onClick={()=>setView('table')} title="Таблица"><ListChecks size={16}/></button><button className={`view-toggle ${view==='grid'?'selected':''}`} onClick={()=>setView('grid')} title="Карточки"><ContactIcon size={16}/></button></div></div>
    {view==='table'?<div className="table-card"><table><thead><tr><th>КОНТАКТ</th><th>КОМПАНИЯ</th><th>СТАТУС</th><th>ИСТОЧНИК</th><th>ПОСЛЕДНИЙ КОНТАКТ</th><th>ПОТЕНЦИАЛ</th><th/></tr></thead><tbody>{visible.map(contact=><tr key={contact.id}><td><div className="contact-cell"><Avatar name={contact.name} color={avatarColor(contact.id)}/><div><b>{contact.name}</b><span>{contact.email}</span></div></div></td><td className="muted-cell">{contact.company||'—'}</td><td><StatusBadge status={contact.status}/></td><td className="muted-cell">{contact.source}</td><td className="muted-cell">{dateShort(contact.last_contact)}</td><td className="value-cell">{currency(contact.value,true)}</td><td><div className="table-actions"><button className="icon-button" title="Редактировать" onClick={()=>onEdit(contact)}><Settings size={15}/></button><button className="icon-button danger-hover" title="Удалить" onClick={()=>onDelete(contact)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table>{visible.length===0&&<EmptyState title="Контакты не найдены" text="Измените фильтр или добавьте нового клиента." action={onCreate}/>}</div>:<div className="contact-grid">{visible.map(contact=><div className="contact-card" key={contact.id}><div className="contact-card-top"><Avatar name={contact.name} color={avatarColor(contact.id)} size="large"/><button className="icon-button" onClick={()=>onEdit(contact)}><Settings size={16}/></button></div><h3>{contact.name}</h3><p>{contact.company||'Компания не указана'}</p><StatusBadge status={contact.status}/><div className="contact-card-details"><span><Mail size={14}/>{contact.email||'Email не указан'}</span><span><Briefcase size={14}/>{contact.deals_count||0} сделок</span></div><div className="contact-card-foot"><b>{currency(contact.value,true)}</b><button className="text-button" onClick={()=>onDelete(contact)}>Удалить <Trash2 size={13}/></button></div></div>)}</div>}
  </>;
}
function avatarColor(id:number){return ['violet','blue','orange','green','pink','teal'][id%6];}
function StatusBadge({status}:{status:string}) { return <span className={`status-badge status-${status}`}>{statusLabels[status]||status}</span>; }

function DealsPage({deals,onCreate,onStage,onDelete}:{deals:Deal[];onCreate:()=>void;onStage:(deal:Deal,stage:string)=>void;onDelete:(deal:Deal)=>void}) {
  const [dragged,setDragged]=useState<number|null>(null);
  const total=deals.filter(d=>!['won','lost'].includes(d.stage)).reduce((sum,d)=>sum+d.value,0);
  return <><PageHeading eyebrow="ПРОДАЖИ" title="Сделки" subtitle="Двигайте возможности по воронке и держите фокус на результате." action={<PrimaryButton onClick={onCreate}>Новая сделка</PrimaryButton>}/><div className="deal-overview"><div><span>Открытый pipeline</span><b>{currency(total,true)}</b></div><div><span>Активные сделки</span><b>{deals.filter(d=>!['won','lost'].includes(d.stage)).length}</b></div><div><span>Успешно закрыто</span><b>{deals.filter(d=>d.stage==='won').length}</b></div><div><span>Общая база сделок</span><b>{deals.length}</b></div></div><div className="kanban-toolbar"><div><span className="kanban-dot"/> Воронка продаж <span className="kanban-hint">Перетащите карточку в другой этап</span></div><button className="secondary-button small" onClick={onCreate}><Plus size={15}/> Добавить сделку</button></div><div className="kanban-board">{stageOrder.map((stage,index)=>{const column=deals.filter(deal=>deal.stage===stage);return <div className={`kanban-column stage-col-${stage}`} key={stage} onDragOver={e=>e.preventDefault()} onDrop={()=>{const deal=deals.find(d=>d.id===dragged);if(deal&&deal.stage!==stage)onStage(deal,stage);setDragged(null);}}><div className="kanban-column-head"><div><i/><b>{stageLabels[stage]}</b><span>{column.length}</span></div><button className="icon-button"><Plus size={15}/></button></div><div className="kanban-column-total">{currency(column.reduce((sum,d)=>sum+d.value,0),true)}</div><div className="kanban-cards">{column.map(deal=><article className={`deal-card ${dragged===deal.id?'dragging':''}`} key={deal.id} draggable onDragStart={e=>{setDragged(deal.id);e.dataTransfer.setData('text/plain',String(deal.id));e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDragged(null)}><div className="deal-card-top"><span className={`deal-priority-dot dot-${index}`}/><button className="icon-button deal-menu" title="Удалить" onClick={()=>onDelete(deal)}><Ellipsis size={17}/></button></div><h3>{deal.title}</h3><p>{deal.company||deal.contact_name||'Без компании'}</p><div className="deal-card-value">{currency(deal.value,true)}</div><div className="deal-progress"><span style={{width:`${deal.probability}%`}}/></div><div className="deal-card-foot"><span>{deal.contact_name||'Без контакта'}</span><div><Avatar name={deal.owner_name||'Nexora'} color={avatarColor(deal.owner_id||1)} size="small"/></div></div><div className="deal-card-bottom"><span><CalendarDays size={12}/> {dateShort(deal.close_date)}</span><div className="deal-stage-actions"><select aria-label="Изменить этап" value={deal.stage} onChange={e=>onStage(deal,e.target.value)}>{stageOrder.map(item=><option value={item} key={item}>{stageLabels[item]}</option>)}</select></div></div></article>)}{column.length===0&&<div className="kanban-empty">Перетащите сюда сделку</div>}</div></div>;})}</div></>;
}

function TasksPage({tasks,onCreate,onUpdate,onDelete}:{tasks:Task[];onCreate:()=>void;onUpdate:(task:Task,patch:Partial<Task>)=>void;onDelete:(task:Task)=>void}) {
  const [filter,setFilter]=useState('all'); const visible=tasks.filter(task=>filter==='all'||task.status===filter);
  return <><PageHeading eyebrow="ПЛАНИРОВАНИЕ" title="Задачи" subtitle="Приоритеты, сроки и следующие шаги команды — под контролем." action={<PrimaryButton onClick={onCreate}>Новая задача</PrimaryButton>}/><div className="task-stats"><div><span className="task-stat-icon stat-purple"><ListChecks size={17}/></span><div><b>{tasks.filter(t=>t.status==='todo').length}</b><span>К выполнению</span></div></div><div><span className="task-stat-icon stat-blue"><Clock3 size={17}/></span><div><b>{tasks.filter(t=>t.status==='in_progress').length}</b><span>В процессе</span></div></div><div><span className="task-stat-icon stat-green"><CheckCheck size={17}/></span><div><b>{tasks.filter(t=>t.status==='done').length}</b><span>Завершено</span></div></div></div><div className="toolbar task-toolbar"><div className="filter-pills">{[['all','Все задачи'],['todo','К выполнению'],['in_progress','В процессе'],['done','Завершённые']].map(([id,label])=><button className={filter===id?'selected':''} key={id} onClick={()=>setFilter(id)}>{label}</button>)}</div><span className="result-count">{visible.length} задач</span></div><div className="task-table">{visible.map(task=><div className={`task-row ${task.status==='done'?'task-done':''}`} key={task.id}><button className={`task-check large ${task.status==='done'?'checked':task.status==='in_progress'?'in-progress':''}`} title={task.status==='todo'?'Начать задачу':task.status==='in_progress'?'Завершить задачу':'Вернуть в работу'} onClick={()=>onUpdate(task,{status:task.status==='todo'?'in_progress':task.status==='in_progress'?'done':'todo'})}>{task.status==='done'?<Check size={14}/>:task.status==='in_progress'?<Clock3 size={12}/>:null}</button><div className="task-row-main"><b>{task.title}</b><span>{task.description||task.contact_name||'Без описания'}</span></div><div className="task-related">{task.contact_name&&<><Avatar name={task.contact_name} color={avatarColor(task.related_contact_id||1)} size="small"/><span>{task.contact_name}</span></>}</div><span className={`priority-pill priority-${task.priority}`}><i/>{priorityLabels[task.priority]}</span><span className="task-date"><CalendarDays size={14}/>{dateLong(task.due_date)}</span><button className="icon-button danger-hover" onClick={()=>onDelete(task)} title="Удалить"><Trash2 size={15}/></button></div>)}{visible.length===0&&<EmptyState title="Задач не найдено" text="Попробуйте другой фильтр или создайте новую задачу." action={onCreate}/>}</div></>;
}

function CalendarPage({tasks,date,setDate,onCreate,onTask}:{tasks:Task[];date:Date;setDate:(date:Date)=>void;onCreate:()=>void;onTask:(task:Task)=>void}) {
  const year=date.getFullYear(),month=date.getMonth(); const first=new Date(year,month,1); const offset=(first.getDay()+6)%7; const start=new Date(year,month,1-offset); const cells=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
  const monthName=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(date);
  const sameDay=(a:Date,b:Date)=>a.toDateString()===b.toDateString();
  return <><PageHeading eyebrow="ПЛАНИРОВАНИЕ" title="Календарь" subtitle="Сроки, встречи и задачи в одном календарном представлении." action={<PrimaryButton onClick={onCreate}>Новое событие</PrimaryButton>}/><div className="calendar-layout"><div className="calendar-main"><div className="calendar-toolbar"><div><button className="icon-button" onClick={()=>setDate(new Date(year,month-1,1))}><ChevronLeft size={18}/></button><button className="icon-button" onClick={()=>setDate(new Date(year,month+1,1))}><ChevronRight size={18}/></button><h2>{monthName}</h2></div><button className="secondary-button small" onClick={()=>setDate(new Date())}>Сегодня</button></div><div className="calendar-grid"><div className="calendar-weekdays">{['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(day=><span key={day}>{day}</span>)}</div><div className="calendar-days">{cells.map((day,index)=>{const dayTasks=tasks.filter(task=>sameDay(new Date(task.due_date),day));return <div className={`calendar-day ${day.getMonth()!==month?'outside-month':''} ${sameDay(day,new Date())?'today':''}`} key={index}><span className="calendar-day-number">{day.getDate()}</span><div className="calendar-events">{dayTasks.slice(0,3).map(task=><button key={task.id} className={`calendar-event ${task.status==='done'?'event-done':''}`} onClick={()=>onTask(task)} title={task.title}>{task.title}</button>)}{dayTasks.length>3&&<span className="more-events">+{dayTasks.length-3} ещё</span>}</div></div>;})}</div></div></div><aside className="calendar-side"><div className="calendar-side-head"><div className="section-eyebrow">ПОВЕСТКА</div><h3>Предстоящие</h3><p>Ближайшие задачи команды</p></div>{tasks.filter(t=>t.status!=='done').sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,7).map(task=><button className="agenda-item" key={task.id} onClick={()=>onTask(task)}><div className="agenda-date"><b>{new Date(task.due_date).getDate()}</b><span>{new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(new Date(task.due_date))}</span></div><div><b>{task.title}</b><span>{task.contact_name||'Рабочая задача'}</span></div><i className={`priority-dot priority-${task.priority}`}/></button>)}{tasks.filter(t=>t.status!=='done').length===0&&<p className="muted-note">Нет запланированных задач.</p>}<button className="panel-link" onClick={onCreate}>Создать событие <Plus size={14}/></button></aside></div></>;
}

function ReportsPage({reports}:{reports:ReportsData}) {
  const total=reports.byStage.reduce((sum,row)=>sum+Number(row.value||0),0); const wonTotal=Number(reports.byStage.find(row=>row.stage==='won')?.value||0); const maxSource=Math.max(1,...reports.sources.map(s=>s.count)); const maxMonthly=Math.max(1,...reports.monthly.map(m=>Number(m.revenue||0)));
  return <><PageHeading eyebrow="АНАЛИТИКА" title="Отчёты" subtitle="Показатели, которые помогают принимать решения на основе данных." action={<button className="secondary-button" onClick={()=>window.print()}><Download size={16}/> Экспорт / печать</button>}/><div className="report-kpis"><div><span>Выручка успешных сделок</span><b>{currency(wonTotal,true)}</b><small>по закрытым сделкам</small></div><div><span>Всего сделок</span><b>{reports.byStage.reduce((s,r)=>s+r.count,0)}</b><small>актуальный pipeline</small></div><div><span>Закрыто успешно</span><b>{reports.byStage.find(r=>r.stage==='won')?.count||0}</b><small>выигранные сделки</small></div><div><span>Источников лидов</span><b>{reports.sources.length}</b><small>каналы привлечения</small></div></div><div className="reports-grid"><Panel title="Результаты по месяцам" subtitle="Закрытая выручка и количество сделок"><div className="report-bars">{reports.monthly.slice(-8).map(row=><div className="report-bar-column" key={row.month}><div className="report-bar-value">{currency(Number(row.revenue||0),true)}</div><div className="report-bar-track"><i style={{height:`${Math.max(2,Number(row.revenue||0)/maxMonthly*100)}%`}}/></div><span>{monthLabel(row.month)}</span></div>)}</div></Panel><Panel title="Источники контактов" subtitle="Откуда приходят новые возможности"><div className="source-list">{reports.sources.map((row,index)=><div className="source-row" key={row.source}><div><span className={`source-dot source-${index%5}`}/><b>{row.source}</b><strong>{row.count}</strong></div><div className="source-track"><i style={{width:`${row.count/maxSource*100}%`}}/></div></div>)}{reports.sources.length===0&&<EmptyState title="Пока нет данных" text="Источники появятся после добавления контактов."/>}</div></Panel><Panel title="Структура воронки" subtitle="Сумма сделок по этапам"><div className="stage-report-list">{stageOrder.map((stage,i)=>{const row=reports.byStage.find(r=>r.stage===stage);return <div key={stage}><div><span><i className={`stage-color stage-color-${i}`}/>{stageLabels[stage]}</span><b>{currency(Number(row?.value||0),true)}</b></div><div className="source-track"><i className={`stage-color-bg-${i}`} style={{width:`${total?Number(row?.value||0)/total*100:0}%`}}/></div></div>;})}</div></Panel><Panel title="Топ клиентов" subtitle="По суммарному объёму сделок"><div className="top-clients">{reports.topContacts.map((client,index)=><div className="top-client" key={client.id}><span className="rank">0{index+1}</span><Avatar name={client.name} color={avatarColor(client.id)}/><div><b>{client.name}</b><span>{client.company||'Без компании'} · {client.deals} сделок</span></div><strong>{currency(client.value,true)}</strong></div>)}</div></Panel></div></>;
}

function TeamPage({team,currentUser,onCreate,onToggle}:{team:User[];currentUser:User;onCreate:()=>void;onToggle:(user:User)=>void}) { return <><PageHeading eyebrow="УПРАВЛЕНИЕ ДОСТУПОМ" title="Команда" subtitle="Управляйте сотрудниками и уровнем доступа к рабочему пространству." action={currentUser.role==='admin'?<PrimaryButton onClick={onCreate}>Добавить сотрудника</PrimaryButton>:undefined}/><div className="team-stats"><div><Users size={18}/><span>Всего участников</span><b>{team.length}</b></div><div><CircleCheck size={18}/><span>Активные аккаунты</span><b>{team.filter(m=>m.is_active).length}</b></div><div><LockKeyhole size={18}/><span>Администраторы</span><b>{team.filter(m=>m.role==='admin').length}</b></div></div><div className="table-card"><table><thead><tr><th>СОТРУДНИК</th><th>РОЛЬ</th><th>СТАТУС</th><th>ДАТА ДОБАВЛЕНИЯ</th><th/></tr></thead><tbody>{team.map(member=><tr key={member.id}><td><div className="contact-cell"><Avatar name={member.name} color={avatarColor(member.id)}/><div><b>{member.name}{member.id===currentUser.id?' (Вы)':''}</b><span>{member.email}</span></div></div></td><td><span className={`role-pill role-${member.role}`}>{roleLabels[member.role]}</span></td><td><span className={`member-status ${member.is_active?'member-active':'member-disabled'}`}><i/>{member.is_active?'Активен':'Отключён'}</span></td><td className="muted-cell">{dateShort(member.created_at)}</td><td>{currentUser.role==='admin'&&member.id!==currentUser.id&&<button className="secondary-button small" onClick={()=>onToggle(member)}>{member.is_active?'Отключить':'Активировать'}</button>}</td></tr>)}</tbody></table>{team.length===0&&<EmptyState title="Команда пока пуста" text="Добавьте первого сотрудника." action={onCreate}/>}</div><div className="permission-note"><LockKeyhole size={17}/><div><b>Ролевая модель доступа</b><p>Администратор управляет пользователями и всеми данными. Руководитель видит состав команды и все рабочие разделы. Менеджер по продажам работает с контактами, сделками и задачами.</p></div></div></>; }

function Modal({modal,contacts,onClose,onSubmit}:{modal:NonNullable<ModalState>;contacts:Contact[];onClose:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}) {
  const item=modal.item as any; const titles={contact:item?'Редактировать контакт':'Новый контакт',deal:'Новая сделка',task:'Новая задача',team:'Добавить сотрудника'};
  const today=localDateTime(new Date(Date.now()+60*60*1000));
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-card"><div className="modal-head"><div><div className="section-eyebrow">NEXORA WORKSPACE</div><h2>{titles[modal.kind]}</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><form onSubmit={onSubmit}>
    {modal.kind==='contact'&&<><div className="form-grid"><label className="field-label full">Имя и фамилия<input name="name" required defaultValue={item?.name||''} placeholder="Например, Анна Смирнова"/></label><label className="field-label">Компания<input name="company" defaultValue={item?.company||''} placeholder="Название компании"/></label><label className="field-label">Email<input type="email" name="email" defaultValue={item?.email||''} placeholder="name@company.com"/></label><label className="field-label">Телефон<input name="phone" defaultValue={item?.phone||''} placeholder="+7 900 000-00-00"/></label><label className="field-label">Источник<select name="source" defaultValue={item?.source||'Сайт'}><option>Сайт</option><option>Реклама</option><option>LinkedIn</option><option>Рекомендация</option><option>Мероприятие</option><option>Партнёр</option><option>Другое</option></select></label><label className="field-label">Статус<select name="status" defaultValue={item?.status||'lead'}><option value="lead">Лид</option><option value="active">В работе</option><option value="customer">Клиент</option></select></label><label className="field-label">Потенциал, ₽<input type="number" min="0" name="value" defaultValue={item?.value||0}/></label><label className="field-label full">Теги, через запятую<input name="tags" defaultValue={item?.tags?.join(', ')||''} placeholder="Enterprise, Приоритет"/></label></div></>}
    {modal.kind==='deal'&&<div className="form-grid"><label className="field-label full">Название сделки<input name="title" required placeholder="Например, Разработка платформы"/></label><label className="field-label">Компания<input name="company" placeholder="Название компании"/></label><label className="field-label">Контакт<select name="contact_id" defaultValue=""><option value="">Не выбран</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}</select></label><label className="field-label">Сумма, ₽<input type="number" min="0" name="value" required defaultValue="150000"/></label><label className="field-label">Этап<select name="stage" defaultValue="lead">{stageOrder.map(stage=><option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label><label className="field-label">Вероятность, %<input type="number" min="0" max="100" name="probability" defaultValue="20"/></label><label className="field-label">Дата закрытия<input type="date" name="close_date"/></label></div>}
    {modal.kind==='task'&&<div className="form-grid"><label className="field-label full">Название задачи<input name="title" required placeholder="Что нужно сделать?"/></label><label className="field-label full">Описание<textarea name="description" rows={3} placeholder="Дополнительные детали..."/></label><label className="field-label">Срок выполнения<input name="due_date" type="datetime-local" required defaultValue={today}/></label><label className="field-label">Приоритет<select name="priority" defaultValue="medium"><option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option></select></label><label className="field-label full">Связанный контакт<select name="related_contact_id" defaultValue=""><option value="">Не выбран</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}</select></label></div>}
    {modal.kind==='team'&&<div className="form-grid"><label className="field-label full">Имя сотрудника<input name="name" required placeholder="Имя и фамилия"/></label><label className="field-label full">Рабочий email<input type="email" name="email" required placeholder="name@company.com"/></label><label className="field-label full">Временный пароль<input type="password" name="password" minLength={10} required placeholder="Не менее 10 символов"/><small>Передайте пароль сотруднику по защищённому каналу.</small></label><label className="field-label full">Роль<select name="role" defaultValue="sales"><option value="sales">Менеджер по продажам</option><option value="manager">Руководитель</option><option value="admin">Администратор</option></select></label></div>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button type="submit" className="primary-button"><Check size={16}/> Сохранить</button></div>
  </form></div></div>;
}

export default App;
