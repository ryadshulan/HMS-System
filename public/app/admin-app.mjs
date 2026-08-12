import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@19.2.5';
import { createRoot } from 'https://esm.sh/react-dom@19.2.5/client';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(React.createElement);
const UI_HISTORY_KEY = 'hms_ui_history';
const tabs = [
  { key: 'dashboard', label: 'الرئيسية', icon: 'fa-home' },
  { key: 'shipments', label: 'الشحنات', icon: 'fa-boxes-stacked' },
  { key: 'clients', label: 'العملاء', icon: 'fa-users' },
  { key: 'news', label: 'الأخبار', icon: 'fa-newspaper' },
  { key: 'users', label: 'المستخدمون', icon: 'fa-user-shield' },
  { key: 'logs', label: 'السجل', icon: 'fa-clock-rotate-left' },
];
const extendableServices = [
  { icon: 'fa-whatsapp', title: 'Meta WhatsApp Cloud API', description: 'إرسال مباشر بدون وسيط مع Webhook لحالة الرسائل.' },
  { icon: 'fa-message', title: 'SMS', description: 'يمكن ربط مزود رسائل نصية بدل أو مع واتساب بسهولة.' },
  { icon: 'fa-cloud-arrow-up', title: 'Cloud Uploads', description: 'الصور تدعم Local أو Cloudinary الآن وقابلة للاستبدال.' },
  { icon: 'fa-chart-line', title: 'تقارير وذكاء أعمال', description: 'الهيكل الحالي جاهز لإضافة تقارير متقدمة ولوحات مؤشرات.' },
];
const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'operator', label: 'Operator' },
];

function getStoredUiHistory() {
  try {
    const raw = localStorage.getItem(UI_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveUiHistory(entries) {
  localStorage.setItem(UI_HISTORY_KEY, JSON.stringify(entries.slice(0, 50)));
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  try {
    return new Date(value).toLocaleString('ar-EG');
  } catch (error) {
    return value;
  }
}

function formatAnalyticsDay(value) {
  if (!value) {
    return '-';
  }

  try {
    return new Intl.DateTimeFormat('ar-YE', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Aden',
    }).format(new Date(`${value}T12:00:00Z`));
  } catch (error) {
    return value;
  }
}

function getDeviceLabel(value) {
  return (
    {
      desktop: 'كمبيوتر',
      mobile: 'هاتف',
      tablet: 'جهاز لوحي',
    }[value] || 'غير معروف'
  );
}

function getReferrerLabel(value) {
  return value && value !== 'direct' ? value : 'دخول مباشر';
}

function getNotificationFailureReason(item) {
  if (!item || item.delivered) {
    return '';
  }

  try {
    const parsed = JSON.parse(item.providerResponse || '{}');
    return parsed?.error?.error_data?.details || parsed?.error?.message || '';
  } catch (error) {
    return item.providerResponse || '';
  }
}

function makeToast(type, title, message) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title,
    message,
  };
}

function makeShipmentForm(milestones, current = null) {
  const milestoneState = milestones.reduce((accumulator, definition) => {
    const currentState = current?.milestones?.[definition.key];
    accumulator[definition.key] = {
      manualCompleted:
        typeof currentState?.manualCompleted === 'boolean'
          ? currentState.manualCompleted
          : Boolean(currentState?.completed && !currentState?.autoCompleted),
      estimatedDate: currentState?.estimatedDate || '',
    };
    return accumulator;
  }, {});

  return {
    editId: current?.id || '',
    trackingNumber: current?.id || '',
    location: current?.location || '',
    updateNote: current?.updateNote || '',
    milestoneCompletionMode:
      current?.milestoneCompletionMode === 'legacy-automatic'
        ? 'legacy-automatic'
        : 'manual',
    milestones: milestoneState,
  };
}

function makeClientForm(current = null) {
  return {
    id: current?._id || '',
    name: current?.name || '',
    container: current?.container || '',
    phone: current?.phone || '',
    notes: current?.notes || '',
    whatsappOptIn: current?.whatsappOptIn ?? false,
    whatsappOptInSource: current?.whatsappOptInSource || 'staff',
  };
}

function makeNewsForm(current = null) {
  return {
    id: current?._id || '',
    title: current?.title || '',
    date: current?.date || '',
    desc: current?.desc || '',
    image: current?.image || '',
    imageProvider: current?.imageProvider || 'local',
    imagePublicId: current?.imagePublicId || '',
    file: null,
    preview: current?.image || '',
  };
}

function makeUserForm(current = null) {
  return {
    id: current?._id || '',
    name: current?.name || '',
    username: current?.username || '',
    password: '',
    recoveryEmail: current?.recoveryEmail || '',
    recoveryPhone: current?.recoveryPhone || '',
    role: current?.role || 'operator',
    active: current?.active ?? true,
  };
}

function getTodayInAden() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Aden',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isShipmentDelivered(shipment, milestones) {
  const finalStageKey = milestones.length
    ? milestones[milestones.length - 1].key
    : 'adenWarehouse';
  return Boolean(shipment?.milestones?.[finalStageKey]?.completed);
}

function deriveMilestoneSequence(definitions, milestoneState, milestoneCompletionMode) {
  const todayValue = getTodayInAden();
  const highestCompletedIndex = definitions.reduce((highestIndex, definition, index) => {
    const state = milestoneState[definition.key] || {};
    const completedAutomatically =
      milestoneCompletionMode === 'legacy-automatic' &&
      Boolean(state.estimatedDate && state.estimatedDate <= todayValue);
    return state.manualCompleted || completedAutomatically ? index : highestIndex;
  }, -1);
  const firstIncompleteIndex =
    highestCompletedIndex >= definitions.length - 1 ? -1 : highestCompletedIndex + 1;
  const currentIndex = firstIncompleteIndex === -1 ? definitions.length : firstIncompleteIndex;

  return definitions.map((definition, index) => {
    const state = milestoneState[definition.key] || {};
    const completed = index <= highestCompletedIndex;
    const autoCompleted =
      milestoneCompletionMode === 'legacy-automatic' &&
      completed &&
      !state.manualCompleted;
    return {
      ...definition,
      completed,
      manualCompleted: Boolean(state.manualCompleted),
      autoCompleted,
      estimatedDate: state.estimatedDate || '',
      visualState: completed ? 'completed' : index === currentIndex ? 'current' : 'upcoming',
    };
  });
}

function InputField({
  label,
  icon = '',
  type = 'text',
  value,
  placeholder = '',
  onInput,
  readOnly = false,
  autoComplete = '',
  inputMode = '',
  maxLength,
}) {
  return html`
    <label className="field">
      <span>${label}</span>
      <div className=${icon ? 'search-field' : ''}>
        ${icon ? html`<i className=${`fas ${icon}`}></i>` : null}
        <input
          type=${type}
          value=${value}
          placeholder=${placeholder}
          onInput=${onInput}
          readOnly=${readOnly}
          autoComplete=${autoComplete}
          inputMode=${inputMode}
          maxLength=${maxLength}
        />
      </div>
    </label>
  `;
}

function SelectField({ label, value, options, onChange }) {
  return html`
    <label className="field">
      <span>${label}</span>
      <select value=${value} onChange=${onChange}>
        ${options.map((option) => html`<option value=${option.value}>${option.label}</option>`)}
      </select>
    </label>
  `;
}

function TextAreaField({ label, value, placeholder = '', onInput }) {
  return html`
    <label className="field">
      <span>${label}</span>
      <textarea value=${value} placeholder=${placeholder} onInput=${onInput}></textarea>
    </label>
  `;
}

function EmptyState({ children }) {
  return html`<div className="empty-state">${children}</div>`;
}

function ToastStack({ toasts }) {
  if (!toasts.length) {
    return null;
  }

  return html`
    <div className="toast-stack">
      ${toasts.map(
        (toast) => html`
          <div key=${toast.id} className=${`toast ${toast.type}`}>
            <h5>${toast.title}</h5>
            <p>${toast.message}</p>
          </div>
        `
      )}
    </div>
  `;
}

function App() {
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [recoveryConfig, setRecoveryConfig] = useState({ whatsapp: false, email: false });
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loadingData, setLoadingData] = useState(false);
  const [milestones, setMilestones] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [clients, setClients] = useState([]);
  const [newsList, setNewsList] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [whatsappMessages, setWhatsappMessages] = useState([]);
  const [visitAnalytics, setVisitAnalytics] = useState(null);
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [toasts, setToasts] = useState([]);
  const [uiHistory, setUiHistory] = useState(getStoredUiHistory());
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [recoveryForm, setRecoveryForm] = useState({
    username: '',
    channel: '',
    requestId: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [setupForm, setSetupForm] = useState({ name: '', username: '', password: '', confirmPassword: '' });
  const [shipmentForm, setShipmentForm] = useState(makeShipmentForm([]));
  const [clientForm, setClientForm] = useState(makeClientForm());
  const [newsForm, setNewsForm] = useState(makeNewsForm());
  const [userForm, setUserForm] = useState(makeUserForm());

  const canManageUsers = user?.role === 'admin';
  const canViewUsers = user?.role === 'admin' || user?.role === 'manager';
  const recoveryChannelOptions = [
    ...(recoveryConfig.whatsapp ? [{ value: 'whatsapp', label: 'رسالة واتساب' }] : []),
    ...(recoveryConfig.email ? [{ value: 'email', label: 'البريد الإلكتروني' }] : []),
  ];
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => (tab.key === 'users' ? canViewUsers : true)),
    [canViewUsers]
  );

  const filteredShipments = useMemo(() => {
    const query = shipmentSearch.trim().toLowerCase();
    if (!query) {
      return shipments;
    }

    return shipments.filter((shipment) =>
      [shipment.id, shipment.statusAr, shipment.location]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [shipments, shipmentSearch]);

  const dashboardStats = useMemo(() => {
    const finalStageKey = milestones.length ? milestones[milestones.length - 1].key : 'adenWarehouse';
    return {
      shipments: shipments.length,
      delivered: shipments.filter((shipment) => shipment.milestones?.[finalStageKey]?.completed).length,
      news: newsList.length,
      clients: clients.length,
      lastActivity: logs[0] ? `${logs[0].action} - ${formatDate(logs[0].createdAt)}` : 'لا يوجد نشاط بعد',
    };
  }, [shipments, clients, newsList, logs, milestones]);

  const visitChartData = useMemo(
    () => (Array.isArray(visitAnalytics?.daily) ? visitAnalytics.daily.slice(-14) : []),
    [visitAnalytics]
  );
  const visitChartMaximum = useMemo(
    () => Math.max(1, ...visitChartData.map((item) => Number(item.visits) || 0)),
    [visitChartData]
  );

  const shipmentMilestoneSequence = useMemo(
    () =>
      deriveMilestoneSequence(
        milestones,
        shipmentForm.milestones || {},
        shipmentForm.milestoneCompletionMode
      ),
    [milestones, shipmentForm.milestones, shipmentForm.milestoneCompletionMode]
  );

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const [setupData, milestoneData, recoveryData] = await Promise.all([
          apiRequest('/api/auth/setup-status'),
          apiRequest('/api/shipment-milestones'),
          apiRequest('/api/auth/recovery-config'),
        ]);

        if (!active) {
          return;
        }

        setNeedsSetup(setupData.needsSetup);
        setMilestones(milestoneData);
        setShipmentForm(makeShipmentForm(milestoneData));
        const configuredChannels = recoveryData.channels || { whatsapp: false, email: false };
        const defaultRecoveryChannel = configuredChannels.whatsapp
          ? 'whatsapp'
          : configuredChannels.email
            ? 'email'
            : '';
        setRecoveryConfig(configuredChannels);
        setRecoveryForm((current) => ({ ...current, channel: defaultRecoveryChannel }));

        if (!setupData.needsSetup) {
          const meResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
          if (meResponse.ok) {
            const meData = await meResponse.json();
            if (!active) {
              return;
            }

            setUser(meData.user);
            await loadAllData(meData.user, milestoneData);
          }
        }
      } catch (error) {
        console.error(error);
        setAuthError(error.message || 'تعذر الاتصال بخادم النظام. تحقق من اتصال MongoDB ثم أعد المحاولة.');
        pushToast('error', 'فشل التهيئة', 'تعذر قراءة إعدادات النظام عند التحميل الأول.');
      } finally {
        if (active) {
          setBooting(false);
        }
      }
    }

    initialize();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toasts.length) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 3200);

    return () => clearTimeout(timeout);
  }, [toasts]);

  function pushUiHistory(action, detail) {
    const next = [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        action,
        detail,
        time: new Date().toISOString(),
      },
      ...uiHistory,
    ].slice(0, 50);

    setUiHistory(next);
    saveUiHistory(next);
  }

  function pushToast(type, title, message) {
    setToasts((current) => [...current, makeToast(type, title, message)].slice(-4));
  }

  async function apiRequest(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers,
    });

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(data?.message || data || 'Request failed');
    }

    return data;
  }

  async function loadAllData(currentUser = user, milestoneData = milestones) {
    if (!currentUser) {
      return;
    }

    setLoadingData(true);
    try {
      const requests = [
        apiRequest('/api/shipments'),
        apiRequest('/api/clients'),
        apiRequest('/api/news'),
        apiRequest('/api/logs'),
        apiRequest('/api/notifications'),
        apiRequest('/api/whatsapp/status'),
        apiRequest('/api/whatsapp/messages'),
        apiRequest('/api/analytics/overview?days=30').catch((error) => ({
          unavailable: true,
          message: error.message,
        })),
      ];

      if (currentUser.role === 'admin' || currentUser.role === 'manager') {
        requests.push(apiRequest('/api/users'));
      } else {
        requests.push(Promise.resolve([]));
      }

      const [
        shipmentsData,
        clientsData,
        newsData,
        logsData,
        notificationsData,
        whatsappStatusData,
        whatsappMessagesData,
        visitAnalyticsData,
        usersData,
      ] = await Promise.all(requests);

      setShipments(shipmentsData);
      setClients(clientsData);
      setNewsList(newsData);
      setLogs(logsData);
      setNotifications(notificationsData);
      setWhatsappStatus(whatsappStatusData);
      setWhatsappMessages(whatsappMessagesData);
      setVisitAnalytics(visitAnalyticsData);
      setUsers(usersData);
      setMilestones(milestoneData);
    } catch (error) {
      pushToast('error', 'تعذر تحميل البيانات', error.message);
    } finally {
      setLoadingData(false);
    }
  }

  async function handleBootstrap(event) {
    event.preventDefault();
    setAuthError('');

    if (setupForm.password.length < 8) {
      setAuthError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }

    if (setupForm.password !== setupForm.confirmPassword) {
      setAuthError('تأكيد كلمة المرور غير مطابق.');
      return;
    }

    try {
      const data = await apiRequest('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setupForm.name,
          username: setupForm.username,
          password: setupForm.password,
        }),
      });

      setNeedsSetup(false);
      setUser(data.user);
      pushUiHistory('تهيئة النظام', `تم إنشاء المدير الأول ${data.user.username}`);
      pushToast('success', 'تم إنشاء النظام', 'تم إنشاء أول مستخدم مدير وتسجيل دخوله.');
      await loadAllData(data.user, milestones);
    } catch (error) {
      setAuthError(error.message);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });

      setUser(data.user);
      pushUiHistory('تسجيل دخول', `تم دخول المستخدم ${data.user.username}`);
      pushToast('success', 'تم تسجيل الدخول', `مرحباً ${data.user.name}`);
      await loadAllData(data.user, milestones);
    } catch (error) {
      setAuthError(error.message);
    }
  }

  function openPasswordRecovery() {
    setAuthError('');
    setAuthNotice('');
    setRecoveryForm((current) => ({
      ...current,
      username: loginForm.username || current.username,
      requestId: '',
      code: '',
      newPassword: '',
      confirmPassword: '',
    }));
    setAuthMode('forgot');
  }

  function returnToLogin() {
    setAuthError('');
    setAuthNotice('');
    setAuthMode('login');
  }

  async function handleRequestPasswordReset(event) {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');

    if (!recoveryForm.username.trim() || !recoveryForm.channel) {
      setAuthError('أدخل اسم المستخدم واختر وسيلة استلام الرمز.');
      return;
    }

    setRecoveryBusy(true);
    try {
      const data = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: recoveryForm.username,
          channel: recoveryForm.channel,
        }),
      });

      setRecoveryForm((current) => ({ ...current, requestId: data.requestId, code: '' }));
      setAuthNotice(data.message || 'تم إرسال رمز الاسترجاع.');
      setAuthMode('reset');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setAuthError('');
    setAuthNotice('');

    if (!/^\d{6}$/.test(recoveryForm.code.trim())) {
      setAuthError('أدخل رمز التحقق المكوّن من 6 أرقام.');
      return;
    }

    if (recoveryForm.newPassword.length < 12) {
      setAuthError('كلمة المرور الجديدة يجب أن تكون 12 حرفاً على الأقل.');
      return;
    }

    if (recoveryForm.newPassword !== recoveryForm.confirmPassword) {
      setAuthError('تأكيد كلمة المرور الجديدة غير مطابق.');
      return;
    }

    setRecoveryBusy(true);
    try {
      const data = await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: recoveryForm.requestId,
          code: recoveryForm.code,
          newPassword: recoveryForm.newPassword,
        }),
      });

      setLoginForm({ username: data.username || recoveryForm.username, password: '' });
      setRecoveryForm((current) => ({
        ...current,
        requestId: '',
        code: '',
        newPassword: '',
        confirmPassword: '',
      }));
      setAuthMode('login');
      setAuthNotice('تم تعيين كلمة المرور الجديدة. يمكنك تسجيل الدخول الآن.');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error(error);
    }

    setUser(null);
    setActiveTab('dashboard');
    setLoginForm({ username: '', password: '' });
    setAuthMode('login');
    pushUiHistory('تسجيل خروج', 'تم تسجيل الخروج من لوحة الإدارة');
  }

  function updateShipmentMilestone(stageKey, checked) {
    setShipmentForm((current) => {
      const nextMilestones = { ...current.milestones };
      const currentIndex = milestones.findIndex((definition) => definition.key === stageKey);

      milestones.forEach((definition, index) => {
        if (checked && index < currentIndex) {
          nextMilestones[definition.key] = {
            ...nextMilestones[definition.key],
            manualCompleted: true,
          };
        }

        if (!checked && index > currentIndex) {
          nextMilestones[definition.key] = {
            ...nextMilestones[definition.key],
            manualCompleted: false,
          };
        }
      });

      nextMilestones[stageKey] = {
        ...nextMilestones[stageKey],
        manualCompleted: checked,
      };

      return {
        ...current,
        milestones: nextMilestones,
      };
    });
  }

  function updateShipmentMilestoneDate(stageKey, estimatedDate) {
    setShipmentForm((current) => ({
      ...current,
      milestones: {
        ...current.milestones,
        [stageKey]: {
          ...current.milestones[stageKey],
          estimatedDate,
        },
      },
    }));
  }

  async function handleSaveShipment(event) {
    event.preventDefault();
    if (!shipmentForm.trackingNumber.trim()) {
      pushToast('error', 'بيانات ناقصة', 'رقم التتبع مطلوب.');
      return;
    }

    try {
      const data = await apiRequest('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: shipmentForm.trackingNumber,
          location: shipmentForm.location,
          updateNote: shipmentForm.updateNote,
          milestones: shipmentForm.milestones,
        }),
      });

      const actionLabel = shipmentForm.editId ? 'تحديث شحنة' : 'إضافة شحنة';
      pushUiHistory(actionLabel, `الحاوية ${data.shipment.id}`);
      pushToast('success', 'تم حفظ الشحنة', `تم حفظ التحديث الخاص بالحاوية ${data.shipment.id}.`);

      if (Array.isArray(data.notifications) && data.notifications.length) {
        const deliveredCount = data.notifications.filter((item) => item.delivered).length;
        const failedCount = data.notifications.length - deliveredCount;
        const firstFailureReason = getNotificationFailureReason(
          data.notifications.find((item) => !item.delivered)
        );
        pushToast(
          failedCount ? 'error' : 'success',
          'تنبيهات العملاء',
          failedCount
            ? `فشل إرسال ${failedCount} إشعار. ${firstFailureReason || 'راجع سجل إشعارات WhatsApp لمعرفة السبب.'}`
            : `تم إرسال أو قبول ${deliveredCount} إشعار مرتبط بهذه الحاوية.`
        );
      }

      setShipmentForm(makeShipmentForm(milestones));
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر حفظ الشحنة', error.message);
    }
  }

  function handleEditShipment(shipment) {
    setActiveTab('shipments');
    setShipmentForm(makeShipmentForm(milestones, shipment));
    pushToast('info', 'وضع التعديل', `أنت الآن تعدّل الحاوية ${shipment.id}.`);
  }

  async function handleDeleteShipment(shipment) {
    if (!window.confirm(`حذف الشحنة ${shipment.id}؟`)) {
      return;
    }

    try {
      await apiRequest(`/api/shipments/${shipment.id}`, { method: 'DELETE' });
      pushUiHistory('حذف شحنة', `الحاوية ${shipment.id}`);
      pushToast('success', 'تم حذف الشحنة', `تم حذف الحاوية ${shipment.id}.`);
      if (shipmentForm.editId === shipment.id) {
        setShipmentForm(makeShipmentForm(milestones));
      }
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر حذف الشحنة', error.message);
    }
  }

  async function handleNotifyShipment(shipment) {
    if (!window.confirm(`إرسال إشعار وصول الحاوية ${shipment.id} للعملاء الموافقين المرتبطين بها؟`)) {
      return;
    }

    try {
      const data = await apiRequest(`/api/shipments/${shipment.id}/notifications`, {
        method: 'POST',
      });
      const results = Array.isArray(data.notifications) ? data.notifications : [];
      const deliveredCount = results.filter((item) => item.delivered).length;
      const failedCount = results.length - deliveredCount;
      pushUiHistory('إشعارات واتساب', `الحاوية ${shipment.id}: ناجح ${deliveredCount}، غير مرسل ${failedCount}`);
      pushToast(
        failedCount ? 'warning' : 'success',
        'تم تشغيل إشعارات الوصول',
        `ناجح أو مرسل مسبقًا: ${deliveredCount}، غير مرسل: ${failedCount}.`
      );
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر إرسال الإشعارات', error.message);
    }
  }

  async function handleSaveClient(event) {
    event.preventDefault();

    const url = clientForm.id ? `/api/clients/${clientForm.id}` : '/api/clients';
    const method = clientForm.id ? 'PUT' : 'POST';

    try {
      const data = await apiRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientForm),
      });

      pushUiHistory(clientForm.id ? 'تعديل عميل' : 'إضافة عميل', `${data.name || clientForm.name} - ${data.container || clientForm.container}`);
      pushToast('success', 'تم حفظ العميل', `${clientForm.name} مرتبط الآن بالحاوية ${clientForm.container}.`);
      setClientForm(makeClientForm());
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر حفظ العميل', error.message);
    }
  }

  function handleEditClient(client) {
    setActiveTab('clients');
    setClientForm(makeClientForm(client));
  }

  async function handleDeleteClient(client) {
    if (!window.confirm(`حذف العميل ${client.name}؟`)) {
      return;
    }

    try {
      await apiRequest(`/api/clients/${client._id}`, { method: 'DELETE' });
      pushUiHistory('حذف عميل', client.name);
      pushToast('success', 'تم حذف العميل', `تم حذف العميل ${client.name}.`);
      if (clientForm.id === client._id) {
        setClientForm(makeClientForm());
      }
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر حذف العميل', error.message);
    }
  }

  async function handleExportClients(format) {
    try {
      const response = await fetch(`/api/clients/export/${format}`, { credentials: 'same-origin' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Export failed');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="(.+?)"/)?.[1] || `clients.${format === 'excel' ? 'xls' : format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      pushUiHistory('تصدير عملاء', filename);
      pushToast('success', 'تم التصدير', `تم تنزيل ملف ${filename}.`);
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر التصدير', error.message);
    }
  }

  async function uploadNewsFile() {
    if (!newsForm.file) {
      return {
        image: newsForm.image,
        imageProvider: newsForm.imageProvider,
        imagePublicId: newsForm.imagePublicId,
      };
    }

    const formData = new FormData();
    formData.append('file', newsForm.file);
    const data = await apiRequest('/api/media/upload', {
      method: 'POST',
      body: formData,
    });

    return {
      image: data.url,
      imageProvider: data.provider,
      imagePublicId: data.publicId,
    };
  }

  async function handleSaveNews(event) {
    event.preventDefault();
    if (!newsForm.title.trim()) {
      pushToast('error', 'بيانات ناقصة', 'عنوان الخبر مطلوب.');
      return;
    }

    try {
      const media = await uploadNewsFile();
      const url = newsForm.id ? `/api/news/${newsForm.id}` : '/api/news';
      const method = newsForm.id ? 'PUT' : 'POST';
      await apiRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newsForm.title,
          date: newsForm.date,
          desc: newsForm.desc,
          image: media.image,
          imageProvider: media.imageProvider,
          imagePublicId: media.imagePublicId,
        }),
      });

      pushUiHistory(newsForm.id ? 'تعديل خبر' : 'إضافة خبر', newsForm.title);
      pushToast('success', 'تم حفظ الخبر', `تم حفظ الخبر "${newsForm.title}".`);
      setNewsForm(makeNewsForm());
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر حفظ الخبر', error.message);
    }
  }

  function handleNewsFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const preview = URL.createObjectURL(file);
    setNewsForm((current) => ({
      ...current,
      file,
      preview,
    }));
  }

  function handleEditNews(item) {
    setActiveTab('news');
    setNewsForm(makeNewsForm(item));
  }

  async function handleDeleteNews(item) {
    if (!window.confirm(`حذف الخبر "${item.title}"؟`)) {
      return;
    }

    try {
      await apiRequest(`/api/news/${item._id}`, { method: 'DELETE' });
      pushUiHistory('حذف خبر', item.title);
      pushToast('success', 'تم حذف الخبر', `تم حذف الخبر "${item.title}".`);
      if (newsForm.id === item._id) {
        setNewsForm(makeNewsForm());
      }
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر حذف الخبر', error.message);
    }
  }

  async function handleSaveUser(event) {
    event.preventDefault();

    if (!canManageUsers) {
      pushToast('error', 'غير مسموح', 'إدارة المستخدمين الكاملة متاحة للمدير فقط.');
      return;
    }

    const url = userForm.id ? `/api/users/${userForm.id}` : '/api/users';
    const method = userForm.id ? 'PUT' : 'POST';

    try {
      await apiRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm),
      });

      pushUiHistory(userForm.id ? 'تعديل مستخدم' : 'إضافة مستخدم', userForm.username);
      pushToast('success', 'تم حفظ المستخدم', `تم حفظ إعدادات المستخدم ${userForm.username}.`);
      setUserForm(makeUserForm());
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر حفظ المستخدم', error.message);
    }
  }

  function handleEditUser(item) {
    setActiveTab('users');
    setUserForm(makeUserForm(item));
  }

  async function handleDeleteUser(item) {
    if (!window.confirm(`حذف المستخدم ${item.username}؟`)) {
      return;
    }

    try {
      await apiRequest(`/api/users/${item._id}`, { method: 'DELETE' });
      pushUiHistory('حذف مستخدم', item.username);
      pushToast('success', 'تم حذف المستخدم', `تم حذف المستخدم ${item.username}.`);
      if (userForm.id === item._id) {
        setUserForm(makeUserForm());
      }
      await loadAllData();
    } catch (error) {
      pushToast('error', 'تعذر حذف المستخدم', error.message);
    }
  }

  if (booting) {
    return html`
      <div className="boot-screen">
        <div className="boot-card">
          <img src="/uploads/شعار النجم الحديث.jpg" alt="HMS" />
          <h1>لوحة إدارة النجم الحديث</h1>
          <p className="loader"><i className="fas fa-spinner"></i> جاري تحميل النظام الحقيقي...</p>
        </div>
      </div>
    `;
  }

  if (!user) {
    return html`
      <div className="auth-shell">
        <div className="auth-card">
          <img src="/uploads/شعار النجم الحديث.jpg" alt="HMS" />
          <h1>
            ${needsSetup
              ? 'تهيئة لوحة التحكم'
              : authMode === 'forgot'
                ? 'استرجاع كلمة المرور'
                : authMode === 'reset'
                  ? 'التحقق من الرمز'
                  : 'لوحة تحكم حقيقية'}
          </h1>
          <p>
            ${needsSetup
              ? 'هذه أول مرة يتم فيها تشغيل النظام. أنشئ المدير الأول لبدء العمل.'
              : authMode === 'forgot'
                ? 'اختر وسيلة استلام رمز التحقق المرتبطة بحسابك.'
                : authMode === 'reset'
                  ? 'أدخل الرمز المرسل إليك ثم عيّن كلمة مرور جديدة.'
                  : 'تسجيل دخول آمن عبر JWT داخل Cookie محمية من السيرفر.'}
          </p>

          ${authError ? html`<div className="inline-alert">${authError}</div>` : null}
          ${authNotice ? html`<div className="inline-alert success">${authNotice}</div>` : null}

          ${needsSetup
            ? html`
                <form className="form-grid single" onSubmit=${handleBootstrap}>
                  <${InputField}
                    label="الاسم الكامل"
                    value=${setupForm.name}
                    onInput=${(event) => setSetupForm({ ...setupForm, name: event.target.value })}
                  />
                  <${InputField}
                    label="اسم المستخدم"
                    value=${setupForm.username}
                    onInput=${(event) => setSetupForm({ ...setupForm, username: event.target.value })}
                  />
                  <${InputField}
                    label="كلمة المرور"
                    type="password"
                    value=${setupForm.password}
                    onInput=${(event) => setSetupForm({ ...setupForm, password: event.target.value })}
                  />
                  <${InputField}
                    label="تأكيد كلمة المرور"
                    type="password"
                    value=${setupForm.confirmPassword}
                    onInput=${(event) => setSetupForm({ ...setupForm, confirmPassword: event.target.value })}
                  />
                  <div className="auth-actions">
                    <button className="btn btn-primary" type="submit">
                      <i className="fas fa-rocket"></i>
                      إنشاء المدير الأول
                    </button>
                  </div>
                </form>
              `
            : authMode === 'forgot'
              ? html`
                  <form className="form-grid single" onSubmit=${handleRequestPasswordReset}>
                    <${InputField}
                      label="اسم المستخدم"
                      value=${recoveryForm.username}
                      autoComplete="username"
                      onInput=${(event) =>
                        setRecoveryForm((current) => ({ ...current, username: event.target.value }))}
                    />
                    ${recoveryChannelOptions.length
                      ? html`
                          <${SelectField}
                            label="إرسال الرمز عبر"
                            value=${recoveryForm.channel}
                            options=${recoveryChannelOptions}
                            onChange=${(event) =>
                              setRecoveryForm((current) => ({ ...current, channel: event.target.value }))}
                          />
                        `
                      : html`
                          <div className="recovery-unavailable">
                            قنوات إرسال رمز الاسترجاع غير مفعلة بعد. يمكن للمدير تغيير كلمة المرور من قسم المستخدمين.
                          </div>
                        `}
                    <div className="auth-actions">
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled=${recoveryBusy || !recoveryChannelOptions.length}
                      >
                        <i className=${`fas ${recoveryBusy ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                        إرسال رمز التحقق
                      </button>
                      <button className="btn btn-secondary" type="button" onClick=${returnToLogin}>
                        <i className="fas fa-arrow-right"></i>
                        العودة للدخول
                      </button>
                    </div>
                  </form>
                `
              : authMode === 'reset'
                ? html`
                    <form className="form-grid single" onSubmit=${handleResetPassword}>
                      <${InputField}
                        label="رمز التحقق"
                        value=${recoveryForm.code}
                        placeholder="000000"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength=${6}
                        onInput=${(event) =>
                          setRecoveryForm((current) => ({
                            ...current,
                            code: event.target.value.replace(/\D/g, '').slice(0, 6),
                          }))}
                      />
                      <${InputField}
                        label="كلمة المرور الجديدة"
                        type="password"
                        value=${recoveryForm.newPassword}
                        autoComplete="new-password"
                        onInput=${(event) =>
                          setRecoveryForm((current) => ({ ...current, newPassword: event.target.value }))}
                      />
                      <${InputField}
                        label="تأكيد كلمة المرور الجديدة"
                        type="password"
                        value=${recoveryForm.confirmPassword}
                        autoComplete="new-password"
                        onInput=${(event) =>
                          setRecoveryForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                      />
                      <div className="auth-actions">
                        <button className="btn btn-primary" type="submit" disabled=${recoveryBusy}>
                          <i className=${`fas ${recoveryBusy ? 'fa-spinner fa-spin' : 'fa-key'}`}></i>
                          حفظ كلمة المرور
                        </button>
                        <button className="btn btn-secondary" type="button" onClick=${returnToLogin}>
                          <i className="fas fa-arrow-right"></i>
                          العودة للدخول
                        </button>
                      </div>
                    </form>
                  `
                : html`
                <form className="form-grid single" onSubmit=${handleLogin}>
                  <${InputField}
                    label="اسم المستخدم"
                    value=${loginForm.username}
                    autoComplete="username"
                    onInput=${(event) => setLoginForm({ ...loginForm, username: event.target.value })}
                  />
                  <${InputField}
                    label="كلمة المرور"
                    type="password"
                    value=${loginForm.password}
                    autoComplete="current-password"
                    onInput=${(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  />
                  <div className="auth-actions">
                    <button className="btn btn-primary" type="submit">
                      <i className="fas fa-lock-open"></i>
                      دخول آمن
                    </button>
                  </div>
                  <button className="auth-link-button" type="button" onClick=${openPasswordRecovery}>
                    نسيت كلمة المرور؟
                  </button>
                </form>
              `}
        </div>
      </div>
    `;
  }

  return html`
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-row">
            <div className="brand-logo">
              <img src="/uploads/شعار النجم الحديث.jpg" alt="HMS" />
            </div>
            <div>
              <h1>النجم الحديث</h1>
              <p>شحن، تتبع، عملاء، وإشعارات</p>
            </div>
          </div>
        </div>

        <div className="nav-list">
          ${visibleTabs.map(
            (tab) => html`
              <button
                key=${tab.key}
                className=${`nav-button ${activeTab === tab.key ? 'active' : ''}`}
                onClick=${() => setActiveTab(tab.key)}
              >
                <i className=${`fas ${tab.icon}`}></i>
                <span>${tab.label}</span>
              </button>
            `
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>${user.name}</strong>
            <span>${user.username} • ${user.role}</span>
          </div>
          <button className="btn btn-ghost" onClick=${handleLogout}>
            <i className="fas fa-sign-out-alt"></i>
            خروج
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h2>
              ${activeTab === 'dashboard'
                ? 'نظرة عامة'
                : activeTab === 'shipments'
                ? 'إدارة الشحنات'
                : activeTab === 'clients'
                ? 'قاعدة بيانات العملاء'
                : activeTab === 'news'
                ? 'إدارة الأخبار'
                : activeTab === 'users'
                ? 'إدارة المستخدمين'
                : 'سجل النظام'}
            </h2>
            <p>
              ${loadingData
                ? html`<span className="loader"><i className="fas fa-spinner"></i>جاري مزامنة البيانات...</span>`
                : dashboardStats.lastActivity}
            </p>
          </div>
          <span className="pill">
            <i className="fas fa-shield-halved"></i>
            JWT + MongoDB + WhatsApp Cloud API
          </span>
        </div>

        ${activeTab === 'dashboard'
          ? html`
              <div className="stats-grid">
                <div className="card stat-card">
                  <div>
                    <span className="muted">عدد الشحنات</span>
                    <strong className="stat-value">${dashboardStats.shipments}</strong>
                  </div>
                  <i className="fas fa-boxes-stacked"></i>
                </div>
                <div className="card stat-card">
                  <div>
                    <span className="muted">المكتملة</span>
                    <strong className="stat-value">${dashboardStats.delivered}</strong>
                  </div>
                  <i className="fas fa-circle-check"></i>
                </div>
                <div className="card stat-card">
                  <div>
                    <span className="muted">الأخبار</span>
                    <strong className="stat-value">${dashboardStats.news}</strong>
                  </div>
                  <i className="fas fa-newspaper"></i>
                </div>
                <div className="card stat-card">
                  <div>
                    <span className="muted">العملاء</span>
                    <strong className="stat-value">${dashboardStats.clients}</strong>
                  </div>
                  <i className="fas fa-users"></i>
                </div>
              </div>

              <div className="card visit-analytics-card">
                <div className="toolbar">
                  <div>
                    <h3><i className="fas fa-chart-line"></i> مراقبة زيارات الموقع</h3>
                    <span className="muted">آخر 30 يوماً • ${visitAnalytics?.timeZone || 'Asia/Aden'}</span>
                  </div>
                  <div className="button-row">
                    <span className="badge success"><i className="fas fa-lock"></i> خاص</span>
                    <button
                      className="btn btn-secondary"
                      onClick=${() => loadAllData()}
                      title="تحديث الإحصاءات"
                    >
                      <i className="fas fa-rotate"></i>
                      تحديث
                    </button>
                  </div>
                </div>

                ${visitAnalytics?.unavailable
                  ? html`<${EmptyState}>تعذر تحميل إحصاءات الزيارات حالياً.<//>`
                  : visitAnalytics
                    ? html`
                        <div className="visit-summary-grid">
                          <div className="visit-summary-item">
                            <span className="muted">زيارات اليوم</span>
                            <strong>${Number(visitAnalytics.totals?.todayVisits || 0).toLocaleString('ar-EG')}</strong>
                          </div>
                          <div className="visit-summary-item">
                            <span className="muted">زوار اليوم</span>
                            <strong>${Number(visitAnalytics.totals?.todayVisitors || 0).toLocaleString('ar-EG')}</strong>
                          </div>
                          <div className="visit-summary-item">
                            <span className="muted">آخر 7 أيام</span>
                            <strong>${Number(visitAnalytics.totals?.last7Days || 0).toLocaleString('ar-EG')}</strong>
                          </div>
                          <div className="visit-summary-item">
                            <span className="muted">إجمالي الزيارات</span>
                            <strong>${Number(visitAnalytics.totals?.visits || 0).toLocaleString('ar-EG')}</strong>
                          </div>
                        </div>

                        <div className="visit-details-grid">
                          <section className="visit-chart-section">
                            <div className="section-title-row">
                              <h4>الحركة خلال 14 يوماً</h4>
                              <span className="muted">
                                ${Number(visitAnalytics.totals?.last30Days || 0).toLocaleString('ar-EG')} زيارة خلال 30 يوماً
                              </span>
                            </div>
                            <div className="visit-bars">
                              ${visitChartData.map(
                                (item) => html`
                                  <div
                                    key=${item.date}
                                    className="visit-bar-column"
                                    title=${`${item.visits} زيارة • ${item.visitors} زائر`}
                                  >
                                    <span className="visit-bar-value">${item.visits}</span>
                                    <div className="visit-bar-track">
                                      <span
                                        style=${{
                                          height: `${item.visits ? Math.max(10, (item.visits / visitChartMaximum) * 100) : 0}%`,
                                        }}
                                      ></span>
                                    </div>
                                    <small>${formatAnalyticsDay(item.date)}</small>
                                  </div>
                                `
                              )}
                            </div>
                          </section>

                          <section className="visit-breakdown-section">
                            <div>
                              <h4>مصادر الزيارات</h4>
                              <div className="visit-list">
                                ${(visitAnalytics.referrers || []).length
                                  ? visitAnalytics.referrers.map(
                                      (item) => html`
                                        <div key=${item.source} className="visit-list-row">
                                          <span>${getReferrerLabel(item.source)}</span>
                                          <strong>${Number(item.visits || 0).toLocaleString('ar-EG')}</strong>
                                        </div>
                                      `
                                    )
                                  : html`<span className="muted">لا توجد زيارات مسجلة بعد.</span>`}
                              </div>
                            </div>
                            <div>
                              <h4>الأجهزة</h4>
                              <div className="visit-list">
                                ${(visitAnalytics.devices || []).length
                                  ? visitAnalytics.devices.map(
                                      (item) => html`
                                        <div key=${item.type} className="visit-list-row">
                                          <span>${getDeviceLabel(item.type)}</span>
                                          <strong>${Number(item.visits || 0).toLocaleString('ar-EG')}</strong>
                                        </div>
                                      `
                                    )
                                  : html`<span className="muted">لا توجد بيانات أجهزة بعد.</span>`}
                              </div>
                            </div>
                          </section>
                        </div>

                        <div className="visit-recent">
                          <div className="section-title-row">
                            <h4>أحدث الزيارات</h4>
                            <span className="muted">
                              ${Number(visitAnalytics.totals?.visitors || 0).toLocaleString('ar-EG')} زائر تقريبي
                            </span>
                          </div>
                          <div className="visit-recent-grid">
                            ${(visitAnalytics.recent || []).length
                              ? visitAnalytics.recent.map(
                                  (item, index) => html`
                                    <div key=${`${item.createdAt}-${index}`} className="visit-recent-item">
                                      <i className=${`fas ${item.deviceType === 'mobile' ? 'fa-mobile-screen' : item.deviceType === 'tablet' ? 'fa-tablet-screen-button' : 'fa-desktop'}`}></i>
                                      <div>
                                        <strong>${getDeviceLabel(item.deviceType)}</strong>
                                        <span>${getReferrerLabel(item.referrer)} • ${formatDate(item.createdAt)}</span>
                                      </div>
                                    </div>
                                  `
                                )
                              : html`<span className="muted">ستظهر الزيارات الجديدة هنا.</span>`}
                          </div>
                        </div>
                      `
                    : html`<${EmptyState}>جاري تحميل إحصاءات الزيارات...<//>`}
              </div>

              <div className="card">
                <div className="toolbar">
                  <div>
                    <h3>حالة Meta WhatsApp Cloud API</h3>
                    <span className="muted">فحص مباشر وآمن للرقم والقالب وWebhook دون عرض الرموز السرية.</span>
                  </div>
                  <span className=${`badge ${whatsappStatus?.graphApi?.reachable ? 'success' : 'warning'}`}>
                    ${whatsappStatus?.graphApi?.reachable ? 'متصل' : 'يحتاج إجراء'}
                  </span>
                </div>
                <div className="whatsapp-status-grid">
                  <div>
                    <span className="muted">طريقة الإرسال</span>
                    <strong>${whatsappStatus?.deliveryMode === 'template' ? 'قالب معتمد' : 'رسالة نصية'}</strong>
                  </div>
                  <div>
                    <span className="muted">القالب</span>
                    <strong>
                      ${whatsappStatus?.template?.name || 'غير محدد'}
                      ${whatsappStatus?.templateStatus?.status ? ` • ${whatsappStatus.templateStatus.status}` : ''}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">رقم الإرسال</span>
                    <strong>${whatsappStatus?.phone?.displayPhoneNumber || 'غير متاح'}</strong>
                  </div>
                  <div>
                    <span className="muted">حماية Webhook</span>
                    <strong>${whatsappStatus?.webhook?.signatureProtected ? 'مفعلة' : 'تحتاج META_APP_SECRET'}</strong>
                  </div>
                </div>
                ${whatsappStatus?.graphApi?.error?.message
                  ? html`<div className="integration-warning">
                      <i className="fas fa-triangle-exclamation"></i>
                      <span>${whatsappStatus.graphApi.error.message}</span>
                    </div>`
                  : null}
              </div>

              <div className="grid-2">
                <div className="card">
                  <div className="toolbar">
                    <div>
                      <h3>آخر الأخبار</h3>
                      <span className="muted">أحدث 3 عناصر منشورة</span>
                    </div>
                  </div>
                  <div className="news-grid">
                    ${newsList.length
                      ? newsList.slice(0, 3).map(
                          (item) => html`
                            <div key=${item._id} className="news-card">
                              <img src=${item.image || 'https://via.placeholder.com/320x180?text=HMS'} alt=${item.title} />
                              <div className="content">
                                <div className="muted">${item.date || '-'}</div>
                                <h4>${item.title}</h4>
                                <div className="muted">${(item.desc || '').slice(0, 110) || 'بدون وصف'}</div>
                              </div>
                            </div>
                          `
                        )
                      : html`<${EmptyState}>لا توجد أخبار حتى الآن.<//>`}
                  </div>
                </div>

                <div className="card">
                  <div className="toolbar">
                    <div>
                      <h3>الإشعارات الأخيرة</h3>
                      <span className="muted">آخر الرسائل المرتبطة بالشحنات</span>
                    </div>
                  </div>
                  <div className="notification-grid">
                    ${notifications.length
                      ? notifications.slice(0, 4).map(
                          (notification) => html`
                            <div key=${notification._id} className="notification-card">
                              <div className="content">
                                <h4>${notification.clientName}</h4>
                                <div className="muted">الحاوية: ${notification.shipmentId}</div>
                                <div className="muted">الهاتف: ${notification.phone}</div>
                                <div style=${{ marginTop: '10px' }}>
                                  <span className=${`badge ${notification.delivered ? 'success' : 'warning'}`}>
                                    ${notification.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          `
                        )
                      : html`<${EmptyState}>لا توجد إشعارات مسجلة بعد.<//>`}
                  </div>
                </div>
              </div>

              <div className="grid-2">
                <div className="card">
                  <div className="toolbar">
                    <div>
                      <h3>آخر نشاط فعلي</h3>
                      <span className="muted">من سجل السيرفر الحقيقي</span>
                    </div>
                  </div>
                  <div className="mini-grid">
                    ${logs.length
                      ? logs.slice(0, 4).map(
                          (log) => html`
                            <div key=${log._id} className="activity-card">
                              <div className="content">
                                <h4>${log.action}</h4>
                                <div className="muted">${log.section}</div>
                                <div style=${{ marginTop: '10px' }}>${log.details}</div>
                                <div className="muted" style=${{ marginTop: '10px' }}>${formatDate(log.createdAt)}</div>
                              </div>
                            </div>
                          `
                        )
                      : html`<${EmptyState}>لا يوجد سجل بعد.<//>`}
                  </div>
                </div>

                <div className="card">
                  <div className="toolbar">
                    <div>
                      <h3>جاهز للتوسعة</h3>
                      <span className="muted">خدمات يمكن إضافتها بسهولة على نفس البنية</span>
                    </div>
                  </div>
                  <div className="mini-grid">
                    ${extendableServices.map(
                      (service) => html`
                        <div key=${service.title} className="activity-card">
                          <div className="content">
                            <h4><i className=${`fas ${service.icon}`}></i> ${service.title}</h4>
                            <div className="muted">${service.description}</div>
                          </div>
                        </div>
                      `
                    )}
                  </div>
                </div>
              </div>
            `
          : null}

        ${activeTab === 'shipments'
          ? html`
              <div className="card">
                <div className="toolbar">
                  <div>
                    <h3>${shipmentForm.editId ? `تعديل الشحنة ${shipmentForm.editId}` : 'إضافة أو تحديث شحنة'}</h3>
                    <span className="muted">البحث في الجدول يتم محليًا بدون API كما طلبت.</span>
                  </div>
                  <span className="badge">
                    ${shipmentMilestoneSequence.filter((item) => item.completed).length}/${milestones.length} مكتملة
                  </span>
                </div>

                <form onSubmit=${handleSaveShipment}>
                  <div className="form-grid">
                    <${InputField}
                      label="رقم التتبع"
                      value=${shipmentForm.trackingNumber}
                      readOnly=${Boolean(shipmentForm.editId)}
                      onInput=${(event) =>
                        setShipmentForm((current) => ({ ...current, trackingNumber: event.target.value.toUpperCase() }))}
                    />
                    <${InputField}
                      label="الموقع الحالي"
                      value=${shipmentForm.location}
                      onInput=${(event) => setShipmentForm((current) => ({ ...current, location: event.target.value }))}
                    />
                  </div>
                  <div className="form-grid single">
                    <${TextAreaField}
                      label="ملاحظة التحديث"
                      value=${shipmentForm.updateNote}
                      placeholder="ملاحظات إضافية حول التحديث الحالي"
                      onInput=${(event) => setShipmentForm((current) => ({ ...current, updateNote: event.target.value }))}
                    />
                  </div>

                  <div className="milestones-grid">
                    ${shipmentMilestoneSequence.map(
                      (step) => html`
                        <div key=${step.key} className=${`milestone-card ${step.visualState}`}>
                          <div className="milestone-head">
                            <div className="milestone-title">
                              <i className=${`fas ${step.icon}`}></i>
                              <span>${step.titleAr}</span>
                            </div>
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked=${step.manualCompleted}
                                onChange=${(event) => updateShipmentMilestone(step.key, event.target.checked)}
                              />
                              <span>مكتملة يدويًا</span>
                            </label>
                          </div>
                          <div className=${`status-tag ${step.visualState}`}>
                            ${step.visualState === 'completed' ? 'مكتملة' : step.visualState === 'current' ? 'جارية' : 'قادمة'}
                          </div>
                          <label className="milestone-date-field">
                            <span>التاريخ المتوقع <small>(تقريبي)</small></span>
                            <input
                              type="date"
                              value=${step.estimatedDate}
                              onInput=${(event) => updateShipmentMilestoneDate(step.key, event.target.value)}
                            />
                          </label>
                          ${step.autoCompleted
                            ? html`<div className="milestone-auto-note"><i className="fas fa-calendar-check"></i> اكتملت تلقائيًا لأن التاريخ التقريبي قد وصل.</div>`
                            : null}
                          <p className="muted"><strong>قبل التأكيد:</strong> ${step.pendingAr}</p>
                          <p className="muted"><strong>بعد التأكيد:</strong> ${step.completedAr}</p>
                        </div>
                      `
                    )}
                  </div>

                  <div className="button-row" style=${{ marginTop: '18px' }}>
                    <button className="btn btn-primary" type="submit">
                      <i className="fas fa-save"></i>
                      ${shipmentForm.editId ? 'حفظ التعديل' : 'حفظ الشحنة'}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick=${() => setShipmentForm(makeShipmentForm(milestones))}>
                      <i className="fas fa-rotate-left"></i>
                      إعادة ضبط
                    </button>
                  </div>
                </form>
              </div>

              <div className="card">
                <div className="toolbar">
                  <div>
                    <h3>قائمة الشحنات</h3>
                    <span className="muted">فلترة مباشرة داخل الواجهة</span>
                  </div>
                  <div style=${{ width: 'min(360px, 100%)' }}>
                    <${InputField}
                      label="بحث"
                      icon="fa-search"
                      value=${shipmentSearch}
                      placeholder="ابحث برقم الحاوية أو الحالة أو الموقع"
                      onInput=${(event) => setShipmentSearch(event.target.value)}
                    />
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>رقم الحاوية</th>
                        <th>الحالة</th>
                        <th>الموقع</th>
                        <th>آخر تحديث</th>
                        <th>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredShipments.length
                        ? filteredShipments.map(
                            (shipment) => html`
                              <tr key=${shipment.id}>
                                <td>
                                  <strong>${shipment.id}</strong>
                                  <div className="muted" style=${{ marginTop: '8px' }}>
                                    ${shipment.milestoneSequence
                                      ?.filter((item) => item.visualState !== 'upcoming')
                                      .map(
                                        (item) => html`<span key=${item.key} className=${`badge ${item.visualState === 'completed' ? 'success' : 'warning'}`} style=${{ marginLeft: '6px', marginBottom: '6px' }}>
                                          ${item.titleAr}
                                        </span>`
                                      )}
                                  </div>
                                </td>
                                <td>${shipment.statusAr}</td>
                                <td>${shipment.location || '-'}</td>
                                <td>${formatDate(shipment.updatedAt)}</td>
                                <td>
                                  <div className="table-actions">
                                    ${isShipmentDelivered(shipment, milestones)
                                      ? html`<button
                                          className="btn btn-success"
                                          type="button"
                                          title="إرسال أو إعادة محاولة إشعارات واتساب"
                                          onClick=${() => handleNotifyShipment(shipment)}
                                        >
                                          <i className="fab fa-whatsapp"></i>
                                        </button>`
                                      : null}
                                    <button className="btn btn-warning" type="button" onClick=${() => handleEditShipment(shipment)}>
                                      <i className="fas fa-pen"></i>
                                    </button>
                                    <button className="btn btn-danger" type="button" onClick=${() => handleDeleteShipment(shipment)}>
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            `
                          )
                        : html`<tr><td colspan="5"><${EmptyState}>لا توجد نتائج مطابقة.<//></td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            `
          : null}

        ${activeTab === 'clients'
          ? html`
              <div className="card">
                <div className="toolbar">
                  <div>
                    <h3>${clientForm.id ? `تعديل العميل ${clientForm.name}` : 'ربط العملاء بالحاويات'}</h3>
                    <span className="muted">عند اكتمال آخر مرحلة سيتم تشغيل إشعار واتساب للعملاء المرتبطين بنفس الحاوية.</span>
                  </div>
                  <div className="button-row">
                    <button className="btn btn-secondary" type="button" onClick=${() => handleExportClients('csv')}>
                      <i className="fas fa-file-csv"></i>
                      CSV
                    </button>
                    <button className="btn btn-success" type="button" onClick=${() => handleExportClients('excel')}>
                      <i className="fas fa-file-excel"></i>
                      Excel
                    </button>
                  </div>
                </div>

                <form onSubmit=${handleSaveClient}>
                  <div className="form-grid">
                    <${InputField}
                      label="اسم العميل"
                      value=${clientForm.name}
                      onInput=${(event) => setClientForm((current) => ({ ...current, name: event.target.value }))}
                    />
                    <${InputField}
                      label="رقم الحاوية"
                      value=${clientForm.container}
                      onInput=${(event) => setClientForm((current) => ({ ...current, container: event.target.value.toUpperCase() }))}
                    />
                    <${InputField}
                      label="رقم الهاتف"
                      value=${clientForm.phone}
                      onInput=${(event) => setClientForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                    <${InputField}
                      label="ملاحظات"
                      value=${clientForm.notes}
                      onInput=${(event) => setClientForm((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </div>
                  <label className="consent-row">
                    <input
                      type="checkbox"
                      checked=${clientForm.whatsappOptIn}
                      onChange=${(event) =>
                        setClientForm((current) => ({
                          ...current,
                          whatsappOptIn: event.target.checked,
                        }))}
                    />
                    <span>
                      <strong>العميل وافق على استلام إشعارات واتساب</strong>
                      <small>مطلوب قبل إرسال إشعارات الوصول التلقائية وفق سياسات Meta.</small>
                    </span>
                  </label>
                  <div className="button-row" style=${{ marginTop: '18px' }}>
                    <button className="btn btn-primary" type="submit">
                      <i className="fas fa-user-plus"></i>
                      ${clientForm.id ? 'حفظ العميل' : 'إضافة العميل'}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick=${() => setClientForm(makeClientForm())}>
                      <i className="fas fa-rotate-left"></i>
                      إعادة ضبط
                    </button>
                  </div>
                </form>
              </div>

              <div className="card">
                <h3>قاعدة العملاء</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الاسم</th>
                        <th>رقم الحاوية</th>
                        <th>الهاتف</th>
                        <th>واتساب</th>
                        <th>ملاحظات</th>
                        <th>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${clients.length
                        ? clients.map(
                            (client) => html`
                              <tr key=${client._id}>
                                <td>${client.name}</td>
                                <td><span className="badge">${client.container}</span></td>
                                <td>${client.phone}</td>
                                <td>
                                  <span className=${`badge ${client.whatsappOptIn ? 'success' : 'warning'}`}>
                                    ${client.whatsappOptIn ? 'موافق' : 'غير موافق'}
                                  </span>
                                </td>
                                <td>${client.notes || '-'}</td>
                                <td>
                                  <div className="table-actions">
                                    <button className="btn btn-warning" type="button" onClick=${() => handleEditClient(client)}>
                                      <i className="fas fa-pen"></i>
                                    </button>
                                    <button className="btn btn-danger" type="button" onClick=${() => handleDeleteClient(client)}>
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            `
                          )
                        : html`<tr><td colspan="6"><${EmptyState}>لا يوجد عملاء حتى الآن.<//></td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="toolbar">
                  <div>
                    <h3>رسائل واتساب الواردة</h3>
                    <span className="muted">تُربط الرسالة تلقائيًا بسجل العميل عند تطابق رقم الهاتف.</span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الوقت</th>
                        <th>العميل</th>
                        <th>الهاتف</th>
                        <th>الرسالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${whatsappMessages.length
                        ? whatsappMessages.map(
                            (message) => html`
                              <tr key=${message._id}>
                                <td>${formatDate(message.messageTimestamp || message.createdAt)}</td>
                                <td>${message.clientName || 'رقم غير مسجل'}</td>
                                <td>${message.phone}</td>
                                <td>${message.text || `[${message.messageType}]`}</td>
                              </tr>
                            `
                          )
                        : html`<tr><td colspan="4"><${EmptyState}>لا توجد رسائل واتساب واردة بعد.<//></td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            `
          : null}

        ${activeTab === 'news'
          ? html`
              <div className="card">
                <div className="toolbar">
                  <div>
                    <h3>${newsForm.id ? `تعديل الخبر ${newsForm.title}` : 'إضافة خبر مع رفع صورة حقيقي'}</h3>
                    <span className="muted">الصورة ترفع عبر backend، وإذا ضبطت Cloudinary سيتم الرفع إلى السحابة مباشرة.</span>
                  </div>
                </div>

                <form onSubmit=${handleSaveNews}>
                  <div className="form-grid">
                    <${InputField}
                      label="العنوان"
                      value=${newsForm.title}
                      onInput=${(event) => setNewsForm((current) => ({ ...current, title: event.target.value }))}
                    />
                    <${InputField}
                      label="التاريخ"
                      type="date"
                      value=${newsForm.date}
                      onInput=${(event) => setNewsForm((current) => ({ ...current, date: event.target.value }))}
                    />
                  </div>
                  <div className="form-grid single">
                    <${TextAreaField}
                      label="الوصف"
                      value=${newsForm.desc}
                      onInput=${(event) => setNewsForm((current) => ({ ...current, desc: event.target.value }))}
                    />
                  </div>
                  <div className="form-grid single">
                    <label className="field">
                      <span>الصورة</span>
                      <input type="file" accept="image/*" onChange=${handleNewsFileChange} />
                      ${newsForm.preview
                        ? html`<img className="preview-image" src=${newsForm.preview} alt="Preview" />`
                        : null}
                    </label>
                  </div>
                  <div className="button-row" style=${{ marginTop: '18px' }}>
                    <button className="btn btn-primary" type="submit">
                      <i className="fas fa-save"></i>
                      ${newsForm.id ? 'حفظ التعديل' : 'نشر الخبر'}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick=${() => setNewsForm(makeNewsForm())}>
                      <i className="fas fa-rotate-left"></i>
                      إعادة ضبط
                    </button>
                  </div>
                </form>
              </div>

              <div className="card">
                <h3>قائمة الأخبار</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الصورة</th>
                        <th>العنوان</th>
                        <th>التاريخ</th>
                        <th>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${newsList.length
                        ? newsList.map(
                            (item) => html`
                              <tr key=${item._id}>
                                <td>
                                  <img
                                    src=${item.image || 'https://via.placeholder.com/80x60?text=HMS'}
                                    alt=${item.title}
                                    style=${{
                                      width: '80px',
                                      height: '60px',
                                      objectFit: 'cover',
                                      borderRadius: '12px',
                                    }}
                                  />
                                </td>
                                <td>${item.title}</td>
                                <td>${item.date || '-'}</td>
                                <td>
                                  <div className="table-actions">
                                    <button className="btn btn-warning" type="button" onClick=${() => handleEditNews(item)}>
                                      <i className="fas fa-pen"></i>
                                    </button>
                                    <button className="btn btn-danger" type="button" onClick=${() => handleDeleteNews(item)}>
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            `
                          )
                        : html`<tr><td colspan="4"><${EmptyState}>لا توجد أخبار منشورة.<//></td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            `
          : null}

        ${activeTab === 'users'
          ? html`
              <div className="card">
                <div className="toolbar">
                  <div>
                    <h3>${userForm.id ? `تعديل المستخدم ${userForm.username}` : 'نظام المستخدمين الحقيقي'}</h3>
                    <span className="muted">الأدوار محفوظة في قاعدة البيانات، والدخول يعتمد على JWT من السيرفر.</span>
                  </div>
                  ${!canManageUsers
                    ? html`<span className="badge warning">يمكنك العرض فقط، والتعديل للمدير admin.</span>`
                    : null}
                </div>

                <form onSubmit=${handleSaveUser}>
                  <div className="form-grid">
                    <${InputField}
                      label="الاسم"
                      value=${userForm.name}
                      onInput=${(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                    />
                    <${InputField}
                      label="اسم المستخدم"
                      value=${userForm.username}
                      onInput=${(event) => setUserForm((current) => ({ ...current, username: event.target.value }))}
                    />
                    <${InputField}
                      label=${userForm.id ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}
                      type="password"
                      value=${userForm.password}
                      onInput=${(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                    />
                    <${InputField}
                      label="بريد استرجاع الحساب"
                      type="email"
                      value=${userForm.recoveryEmail}
                      placeholder="name@example.com"
                      onInput=${(event) =>
                        setUserForm((current) => ({ ...current, recoveryEmail: event.target.value }))}
                    />
                    <${InputField}
                      label="رقم واتساب للاسترجاع"
                      value=${userForm.recoveryPhone}
                      placeholder="9677XXXXXXXX"
                      inputMode="tel"
                      onInput=${(event) =>
                        setUserForm((current) => ({ ...current, recoveryPhone: event.target.value }))}
                    />
                    <${SelectField}
                      label="الدور"
                      value=${userForm.role}
                      options=${roleOptions}
                      onChange=${(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
                    />
                  </div>
                  <div className="button-row" style=${{ marginTop: '16px' }}>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked=${userForm.active}
                        onChange=${(event) => setUserForm((current) => ({ ...current, active: event.target.checked }))}
                      />
                      <span>الحساب نشط</span>
                    </label>
                  </div>
                  <div className="button-row" style=${{ marginTop: '18px' }}>
                    <button className="btn btn-primary" type="submit" disabled=${!canManageUsers}>
                      <i className="fas fa-user-shield"></i>
                      ${userForm.id ? 'حفظ المستخدم' : 'إضافة مستخدم'}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick=${() => setUserForm(makeUserForm())}>
                      <i className="fas fa-rotate-left"></i>
                      إعادة ضبط
                    </button>
                  </div>
                </form>
              </div>

              <div className="card">
                <h3>قائمة المستخدمين</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الاسم</th>
                        <th>اسم المستخدم</th>
                        <th>الدور</th>
                        <th>الحالة</th>
                        <th>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${users.length
                        ? users.map(
                            (item) => html`
                              <tr key=${item._id}>
                                <td>${item.name}</td>
                                <td>${item.username}</td>
                                <td><span className="badge">${item.role}</span></td>
                                <td>
                                  <span className=${`badge ${item.active ? 'success' : 'danger'}`}>
                                    ${item.active ? 'نشط' : 'موقوف'}
                                  </span>
                                </td>
                                <td>
                                  <div className="table-actions">
                                    <button className="btn btn-warning" type="button" onClick=${() => handleEditUser(item)}>
                                      <i className="fas fa-pen"></i>
                                    </button>
                                    <button className="btn btn-danger" type="button" disabled=${!canManageUsers} onClick=${() => handleDeleteUser(item)}>
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            `
                          )
                        : html`<tr><td colspan="5"><${EmptyState}>لا توجد حسابات إضافية بعد.<//></td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            `
          : null}

        ${activeTab === 'logs'
          ? html`
              <div className="grid-2">
                <div className="card">
                  <h3>سجل السيرفر</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>الوقت</th>
                          <th>العملية</th>
                          <th>القسم</th>
                          <th>التفاصيل</th>
                          <th>المنفذ</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${logs.length
                          ? logs.map(
                              (item) => html`
                                <tr key=${item._id}>
                                  <td>${formatDate(item.createdAt)}</td>
                                  <td>${item.action}</td>
                                  <td>${item.section}</td>
                                  <td>${item.details}</td>
                                  <td>${item.actorName || '-'}</td>
                                </tr>
                              `
                            )
                          : html`<tr><td colspan="5"><${EmptyState}>لا يوجد سجل على السيرفر بعد.<//></td></tr>`}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <h3>سجل localStorage للواجهة</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>الوقت</th>
                          <th>النشاط</th>
                          <th>التفاصيل</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${uiHistory.length
                          ? uiHistory.map(
                              (item) => html`
                                <tr key=${item.id}>
                                  <td>${formatDate(item.time)}</td>
                                  <td>${item.action}</td>
                                  <td>${item.detail}</td>
                                </tr>
                              `
                            )
                          : html`<tr><td colspan="3"><${EmptyState}>لا يوجد نشاط واجهة محفوظ محليًا بعد.<//></td></tr>`}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3>سجل إشعارات WhatsApp</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الوقت</th>
                        <th>الحاوية</th>
                        <th>العميل</th>
                        <th>الهاتف</th>
                        <th>الحالة</th>
                        <th>السبب</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${notifications.length
                        ? notifications.map(
                            (item) => html`
                              <tr key=${item._id}>
                                <td>${formatDate(item.createdAt)}</td>
                                <td>${item.shipmentId}</td>
                                <td>${item.clientName}</td>
                                <td>${item.phone}</td>
                                <td>
                                  <span className=${`badge ${item.delivered ? 'success' : 'warning'}`}>
                                    ${item.status}
                                  </span>
                                </td>
                                <td>${getNotificationFailureReason(item) || '-'}</td>
                              </tr>
                            `
                          )
                        : html`<tr><td colspan="6"><${EmptyState}>لا توجد إشعارات مسجلة بعد.<//></td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            `
          : null}
      </main>

      <${ToastStack} toasts=${toasts} />
    </div>
  `;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
