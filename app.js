/* =============================================================================
   COTIZADOR WEB · app.js

   Índice
   1. CONFIGURACIÓN EDITABLE  ← acá se cambian TODOS los valores y textos
   2. Utilidades
   3. Estado
   4. Motor de cálculo (funciones puras, sin tocar el DOM)
   5. Formato y resumen para copiar
   6. Vista (dibuja resultados en el DOM)
   7. Eventos e inicialización

   CÓMO FUNCIONA EL CÁLCULO (en una línea):
     horas por componente → + etapas de gestión (QA, planificación…) → × tarifa por hora
     + costos fijos → × recargo por urgencia (si el plazo es corto) → rango ± margen.
   Todo se calcula en USD y se convierte a ARS con el dólar de referencia.
   ============================================================================= */

'use strict';


/* =============================================================================
   1. CONFIGURACIÓN EDITABLE
   -----------------------------------------------------------------------------
   REGLA DE ORO: todo valor que dependa del escenario es un array de 3 posiciones:
        [ mínimo , recomendado , premium ]
   Ejemplo:  hoursPerPage: [3, 5, 7]  →  3 h en el mínimo, 5 h en el recomendado, 7 h en el premium.

   Este objeto es JSON puro (sin funciones): se puede copiar tal cual a un archivo
   .json o servir desde un backend (ver CONFIG_URL al final de esta sección).
   ============================================================================= */

const CONFIG = {

  /* --- MONEDA ---------------------------------------------------------------
     usdToArs: dólar de referencia (ficticio). También se puede cambiar desde la pantalla.
     rounding: los rangos se redondean a este paso para que no parezcan falsamente exactos.
     stepMonthly: paso para los montos mensuales (son más chicos).
     stepStage: paso de redondeo para los importes de cada etapa. */
  currency: {
    default: 'ARS',
    usdToArs: 1250,
    rounding: { USD: 10, ARS: 5000 },
    stepMonthly: { USD: 1, ARS: 500 },
    stepStage: { USD: 5, ARS: 1000 }
  },

  /* --- ESCENARIOS -----------------------------------------------------------
     El orden de los 3 objetos es el orden de los arrays [mín, rec, premium] de todo el archivo. */
  scenarios: [
    { id: 'minimo',      label: 'Mínimo',      tagline: 'Alcance ajustado, sin colchón de riesgo' },
    { id: 'recomendado', label: 'Recomendado', tagline: 'Calidad, pruebas y margen para imprevistos', featured: true, badge: 'Mejor relación' },
    { id: 'premium',     label: 'Premium',     tagline: 'Más iteraciones, acabado y tranquilidad' }
  ],

  /* --- TARIFAS Y CAPACIDAD ---------------------------------------------------- */
  hourlyRateUsd: [8, 11, 15],          // USD por hora de trabajo
  weeklyCapacityHours: [25, 25, 25],   // horas productivas por semana (estudiante junior = part-time)
  rangeSpread: [0.08, 0.10, 0.12],     // ± margen: convierte el valor puntual en un RANGO
  horizonMonths: 12,                   // meses para el "total del primer año"

  /* --- LÍMITES DE LOS CAMPOS NUMÉRICOS ---------------------------------------- */
  limits: {
    pages:        { min: 1, max: 60 },
    desiredWeeks: { min: 1, max: 104 },
    mvps:         { min: 1, max: 6 },
    tools:        { min: 0, max: 20 }
  },

  /* --- VALORES INICIALES DEL FORMULARIO --------------------------------------- */
  defaultState: {
    type: 'institucional', pages: 5, desiredWeeks: null, mvps: 1,
    backend: 'ninguno', tools: 3, features: ['seo'], ai: 'ninguna',
    design: 'plantilla', content: 'parcial', maintenance: 'basico'
  },

  /* --- EJEMPLOS PRECARGADOS (botones de arriba) -------------------------------- */
  presets: [
    { id: 'landing', label: 'Landing rápida', state: {
        type: 'landing', pages: 1, desiredWeeks: 2, mvps: 1, backend: 'ninguno', tools: 2,
        features: ['seo'], ai: 'ninguna', design: 'plantilla', content: 'cliente', maintenance: 'ninguno' } },
    { id: 'tienda', label: 'Tienda online', state: {
        type: 'ecommerce', pages: 10, desiredWeeks: 12, mvps: 2, backend: 'api', tools: 5,
        features: ['auth', 'payments', 'admin', 'seo'], ai: 'basica', design: 'medida', content: 'parcial', maintenance: 'estandar' } },
    { id: 'saas', label: 'App SaaS', state: {
        type: 'saas', pages: 12, desiredWeeks: 8, mvps: 3, backend: 'avanzado', tools: 8,
        features: ['auth', 'payments', 'admin', 'notifications', 'integrations'], ai: 'media', design: 'medida', content: 'cliente', maintenance: 'premium' } }
  ],

  /* --- TIPO DE SITIO (las páginas web más demandadas) ----------------------------
     frontendHours / backendHours : horas base del tipo, sin contar las páginas.
     hoursPerPage                 : horas de maquetado y lógica por cada página.
     complexity                   : 1 (simple) a 5 (muy complejo). Alimenta el medidor de complejidad.
     typicalPages / benchmarkFeatures : se usan SOLO en "Presupuesto medio por tipo de sitio". */
  types: [
    { id: 'landing',       label: 'Landing page',                  demand: 'Muy alta',  hint: 'Una sola página que convierte: ideal para campañas y servicios.',
      frontendHours: [10, 15, 22],  backendHours: [0, 2, 4],     hoursPerPage: [4, 6, 9],  complexity: 1, typicalPages: 1,  benchmarkFeatures: ['seo'] },
    { id: 'institucional', label: 'Sitio institucional / pyme',    demand: 'Muy alta',  hint: 'Home, servicios, nosotros y contacto. El pedido más común.',
      frontendHours: [16, 24, 34],  backendHours: [0, 2, 5],     hoursPerPage: [3, 5, 7],  complexity: 1, typicalPages: 5,  benchmarkFeatures: ['seo'] },
    { id: 'portfolio',     label: 'Portfolio / página personal',   demand: 'Alta',      hint: 'Muestra trabajos y perfil. Mucho diseño, poca lógica.',
      frontendHours: [12, 18, 26],  backendHours: [0, 0, 3],     hoursPerPage: [3, 5, 7],  complexity: 1, typicalPages: 4,  benchmarkFeatures: [] },
    { id: 'blog',          label: 'Blog / medio de contenidos',    demand: 'Media',     hint: 'Publicación de notas con categorías, buscador y SEO.',
      frontendHours: [18, 28, 40],  backendHours: [8, 14, 22],   hoursPerPage: [2, 4, 6],  complexity: 2, typicalPages: 6,  benchmarkFeatures: ['seo'] },
    { id: 'catalogo',      label: 'Catálogo de productos',         demand: 'Alta',      hint: 'Listado y fichas de producto, sin carrito ni pagos.',
      frontendHours: [24, 36, 52],  backendHours: [14, 24, 38],  hoursPerPage: [3, 5, 7],  complexity: 3, typicalPages: 8,  benchmarkFeatures: ['admin'] },
    { id: 'ecommerce',     label: 'E-commerce (tienda online)',    demand: 'Muy alta',  hint: 'Catálogo + carrito + checkout + gestión de pedidos.',
      frontendHours: [36, 56, 80],  backendHours: [32, 52, 78],  hoursPerPage: [3, 6, 9],  complexity: 4, typicalPages: 10, benchmarkFeatures: ['auth', 'payments', 'admin'] },
    { id: 'reservas',      label: 'Sistema de reservas / turnos',  demand: 'Alta',      hint: 'Agenda, disponibilidad, confirmaciones y recordatorios.',
      frontendHours: [28, 42, 60],  backendHours: [30, 48, 72],  hoursPerPage: [3, 5, 8],  complexity: 4, typicalPages: 6,  benchmarkFeatures: ['auth', 'notifications', 'admin'] },
    { id: 'panel',         label: 'Dashboard / panel de gestión',  demand: 'Alta',      hint: 'Tablas, gráficos, filtros y roles para uso interno.',
      frontendHours: [30, 48, 68],  backendHours: [32, 54, 80],  hoursPerPage: [4, 7, 10], complexity: 4, typicalPages: 8,  benchmarkFeatures: ['auth', 'admin'] },
    { id: 'saas',          label: 'Aplicación web / SaaS (MVP)',   demand: 'Muy alta',  hint: 'Producto con cuentas, suscripciones y lógica propia.',
      frontendHours: [44, 72, 104], backendHours: [52, 90, 135], hoursPerPage: [5, 8, 12], complexity: 5, typicalPages: 12, benchmarkFeatures: ['auth', 'admin', 'payments'] },
    { id: 'marketplace',   label: 'Marketplace (varios vendedores)', demand: 'Media',   hint: 'Compradores y vendedores, comisiones y pagos divididos.',
      frontendHours: [60, 96, 140], backendHours: [76, 124, 185], hoursPerPage: [5, 8, 12], complexity: 5, typicalPages: 14, benchmarkFeatures: ['auth', 'payments', 'admin', 'notifications'] }
  ],

  /* --- Valores usados SOLO por la "Referencia rápida" (presupuesto medio por tipo) --- */
  benchmark: {
    design: 'plantilla', content: 'cliente', backend: 'ninguno', tools: 2,
    ai: 'ninguna', mvps: 1, maintenance: 'basico', desiredWeeks: null
  },

  /* --- BACKEND Y DATOS ADICIONALES ----------------------------------------------
     hours/fixedUsd : trabajo extra y costos únicos (USD).
     hostingMonthlyUsd : hosting + dominio por mes (se suma a los costos recurrentes).
     complexity : puntos para el medidor de complejidad. */
  backend: [
    { id: 'ninguno',  label: 'Sin extras (solo lo que ya trae el tipo de sitio)', hours: [0, 0, 0],    fixedUsd: [0, 0, 0], hostingMonthlyUsd: [1, 3, 8],    complexity: 0 },
    { id: 'cms',      label: 'CMS administrable (headless / WordPress)',          hours: [6, 10, 16],  fixedUsd: [0, 0, 0], hostingMonthlyUsd: [3, 8, 18],   complexity: 1 },
    { id: 'api',      label: 'API + base de datos a medida',                      hours: [20, 34, 52], fixedUsd: [0, 0, 0], hostingMonthlyUsd: [8, 16, 35],  complexity: 2.5 },
    { id: 'avanzado', label: 'Backend avanzado (roles, tiempo real, colas)',      hours: [44, 72, 110], fixedUsd: [0, 0, 0], hostingMonthlyUsd: [18, 40, 90], complexity: 5 }
  ],

  /* --- HERRAMIENTAS DE TECNOLOGÍA (se multiplican por la cantidad elegida) ------ */
  tools: {
    hoursPerTool:      [1.5, 2.5, 4],   // aprender + configurar + integrar
    fixedUsdPerTool:   [0, 5, 12],      // licencias o servicios de pago único
    monthlyUsdPerTool: [0, 3, 8]        // suscripciones mensuales
  },

  /* --- FUNCIONALIDADES EXTRA (casillas) -------------------------------------------
     stage: en qué etapa se cuentan las horas ('frontend' o 'backend').
     flag : marca especial que usan las reglas de alertas. */
  features: [
    { id: 'auth',          label: 'Login y usuarios',                stage: 'backend',  flag: 'auth',     hours: [10, 16, 24], fixedUsd: [0, 0, 0], monthlyUsd: [0, 0, 4] },
    { id: 'payments',      label: 'Pagos online',                    stage: 'backend',  flag: 'payments', hours: [10, 16, 24], fixedUsd: [0, 0, 0], monthlyUsd: [0, 0, 0] },
    { id: 'admin',         label: 'Panel de administración',         stage: 'backend',  hours: [14, 22, 34], fixedUsd: [0, 0, 0], monthlyUsd: [0, 0, 0] },
    { id: 'integrations',  label: 'APIs de terceros',                stage: 'backend',  hours: [6, 10, 16],  fixedUsd: [0, 0, 0], monthlyUsd: [0, 0, 5] },
    { id: 'notifications', label: 'Emails y notificaciones',         stage: 'backend',  hours: [4, 6, 10],   fixedUsd: [0, 0, 0], monthlyUsd: [0, 2, 5] },
    { id: 'i18n',          label: 'Multi-idioma',                    stage: 'frontend', hours: [6, 9, 14],   fixedUsd: [0, 0, 0], monthlyUsd: [0, 0, 0] },
    { id: 'seo',           label: 'SEO técnico y analítica',         stage: 'frontend', hours: [4, 6, 9],    fixedUsd: [0, 0, 0], monthlyUsd: [0, 0, 0] },
    { id: 'a11y',          label: 'Accesibilidad y performance +',   stage: 'frontend', hours: [4, 7, 11],   fixedUsd: [0, 0, 0], monthlyUsd: [0, 0, 0] },
    { id: 'chat',          label: 'Chat en vivo / WhatsApp',         stage: 'frontend', hours: [2, 4, 7],    fixedUsd: [0, 0, 0], monthlyUsd: [0, 0, 8] }
  ],

  /* --- INTELIGENCIA ARTIFICIAL ----------------------------------------------------
     hours/fixedUsd : integración (pago único). monthlyUsd : gasto mensual de API según uso. */
  ai: [
    { id: 'ninguna',  label: 'Sin IA',                                                  hours: [0, 0, 0],     fixedUsd: [0, 0, 0],   monthlyUsd: [0, 0, 0],      complexity: 0 },
    { id: 'basica',   label: 'Básica (textos, FAQ, formularios inteligentes)',          hours: [4, 7, 11],    fixedUsd: [0, 0, 0],   monthlyUsd: [5, 12, 30],    complexity: 1 },
    { id: 'media',    label: 'Media (chatbot con contexto, búsqueda semántica)',        hours: [14, 24, 36],  fixedUsd: [0, 0, 0],   monthlyUsd: [25, 70, 180],  complexity: 2.5 },
    { id: 'avanzada', label: 'Avanzada (RAG, agentes, procesamiento de documentos)',    hours: [40, 66, 100], fixedUsd: [0, 20, 60], monthlyUsd: [100, 300, 800], complexity: 4.5 }
  ],

  /* --- DISEÑO -----------------------------------------------------------------------
     baseHours : trabajo fijo (sistema de diseño, estilos globales). hoursPerPage : por página. */
  design: [
    { id: 'cliente',   label: 'El cliente trae el diseño listo (Figma)',     baseHours: [0, 0, 0],    hoursPerPage: [0.5, 1, 1.5],  fixedUsd: [0, 0, 0] },
    { id: 'plantilla', label: 'Plantilla adaptada a la marca',               baseHours: [1, 2, 3],    hoursPerPage: [1.5, 2.5, 3.5], fixedUsd: [0, 20, 40] },
    { id: 'medida',    label: 'Diseño a medida',                             baseHours: [4, 8, 12],   hoursPerPage: [4, 6, 9],       fixedUsd: [0, 0, 0] },
    { id: 'premium',   label: 'Diseño a medida + animaciones y sistema de diseño', baseHours: [10, 18, 30], hoursPerPage: [7, 10, 15], fixedUsd: [0, 0, 0] }
  ],

  /* --- CONTENIDO --------------------------------------------------------------------- */
  content: [
    { id: 'cliente',  label: 'El cliente entrega textos e imágenes',      hoursPerPage: [0.3, 0.5, 1],   fixedUsd: [0, 0, 0] },
    { id: 'parcial',  label: 'Parcial: yo completo y ajusto',             hoursPerPage: [1, 1.5, 2.2],   fixedUsd: [0, 10, 25] },
    { id: 'completo', label: 'Hay que crear todo (copy + imágenes)',      hoursPerPage: [2, 3, 4.5],     fixedUsd: [10, 30, 70] }
  ],

  /* --- MANTENIMIENTO (costo mensual) -------------------------------------------------- */
  maintenance: [
    { id: 'ninguno',  label: 'Sin mantenimiento',                                          monthlyUsd: [0, 0, 0] },
    { id: 'basico',   label: 'Básico (backups, actualizaciones, correcciones)',            monthlyUsd: [20, 35, 60] },
    { id: 'estandar', label: 'Estándar (+ cambios menores y monitoreo)',                   monthlyUsd: [45, 80, 140] },
    { id: 'premium',  label: 'Premium (+ mejoras continuas y soporte prioritario)',        monthlyUsd: [90, 160, 300] }
  ],

  /* --- MVPs ADICIONALES ----------------------------------------------------------------
     Cada MVP extra suma este % de las horas del proyecto. El primero ya está incluido. */
  mvp: { extraPct: [0.08, 0.12, 0.18] },

  /* --- ETAPAS (en este orden se muestran) -------------------------------------------------
     Las etapas CON "pct" son de gestión: se calculan como % de las horas de desarrollo.
     Las etapas SIN "pct" se llenan con las horas de cada componente. */
  stages: [
    { id: 'planning',   label: 'Planificación y descubrimiento', pct: [0.08, 0.10, 0.12] },
    { id: 'design',     label: 'Diseño UI/UX y contenido' },
    { id: 'frontend',   label: 'Desarrollo frontend' },
    { id: 'backend',    label: 'Backend e integraciones' },
    { id: 'ai',         label: 'Integración de IA' },
    { id: 'mvp',        label: 'Iteraciones de MVP adicionales' },
    { id: 'qa',         label: 'Testing y control de calidad', pct: [0.10, 0.15, 0.20] },
    { id: 'deploy',     label: 'Despliegue y lanzamiento',     pct: [0.03, 0.05, 0.06] },
    { id: 'management', label: 'Gestión y comunicación',       pct: [0.05, 0.08, 0.10] },
    { id: 'buffer',     label: 'Buffer de imprevistos',        pct: [0, 0.10, 0.15] }
  ],

  /* --- RECARGO POR URGENCIA -------------------------------------------------------------
     ratio = semanas estimadas ÷ semanas que pide el cliente. Si es mayor a 1, el plazo es corto.
     Se usa el primer tramo cuyo maxRatio alcance (null = sin tope). */
  rush: [
    { maxRatio: 1,    mult: [1, 1, 1],          points: 0 },
    { maxRatio: 1.25, mult: [1.08, 1.12, 1.18], points: 1 },
    { maxRatio: 1.6,  mult: [1.18, 1.28, 1.4],  points: 2 },
    { maxRatio: null, mult: [1.3, 1.5, 1.75],   points: 3 }
  ],

  /* --- MEDIDOR DE COMPLEJIDAD ---------------------------------------------------------------
     score = suma de puntos (ver weights). El nivel sale de "levels" (primer max que supere al score). */
  complexity: {
    gaugeMax: 32,
    weights: { perTypeLevel: 1.5, perPage: 0.15, perExtraMvp: 1, perTool: 0.5, perFeature: 0.8 },
    levels: [
      { max: 6,    label: 'Baja' },
      { max: 13,   label: 'Media' },
      { max: 22,   label: 'Alta' },
      { max: null, label: 'Muy alta' }
    ]
  },

  /* --- FACTORES QUE ENCARECEN (nombres y explicación del "top 3") --------------------------- */
  factors: {
    type:     { label: 'Tipo de sitio',               why: 'Complejidad base del producto elegido.' },
    pages:    { label: 'Cantidad de páginas',         why: 'Cada página suma maquetado, lógica y pruebas.' },
    design:   { label: 'Diseño',                      why: 'Cuanto más a medida, más horas de UI/UX.' },
    content:  { label: 'Contenido',                   why: 'Crear textos e imágenes también es trabajo.' },
    backend:  { label: 'Backend y datos',             why: 'API, base de datos y lógica del servidor.' },
    tools:    { label: 'Herramientas de tecnología',  why: 'Cada herramienta se configura e integra.' },
    features: { label: 'Funcionalidades extra',       why: 'Login, pagos y paneles suman mucho backend.' },
    ai:       { label: 'Inteligencia artificial',     why: 'Integración y pruebas de comportamiento.' },
    mvps:     { label: 'MVPs adicionales',            why: 'Cada ciclo repite feedback, ajustes y despliegue.' },
    rush:     { label: 'Plazo ajustado',              why: 'Recargo porque el plazo pedido es menor al estimado.' }
  },

  /* --- REGLAS DE ALERTAS ------------------------------------------------------------------------
     Cada regla se activa si TODAS sus condiciones de "when" se cumplen.
     level: 'danger' | 'warn' | 'info'  ·  op: '>', '>=', '<', '<=', '=='
     Métricas disponibles: pages, mvps, tools, features, rushRatio, complexityScore,
       aiLevel, backendLevel, designLevel, contentLevel, maintenanceLevel (posición 0,1,2… en su lista),
       flag_payments, flag_auth (1 si está tildado, 0 si no). */
  alertRules: [
    { id: 'rush-extreme', level: 'danger', when: [{ metric: 'rushRatio', op: '>=', value: 1.6 }],
      title: 'Plazo poco realista',
      text: 'Lo que pide el cliente es mucho menos que el tiempo estimado. Negociá alcance o fechas: apurar sin recortar suele terminar en deuda técnica y errores.' },
    { id: 'rush-tight', level: 'warn', when: [{ metric: 'rushRatio', op: '>', value: 1 }, { metric: 'rushRatio', op: '<', value: 1.6 }],
      title: 'Plazo ajustado: hay recargo por urgencia',
      text: 'El plazo pedido es menor al estimado. Se aplicó un recargo; evaluá si conviene recortar funcionalidades en la primera entrega.' },
    { id: 'complex-extreme', level: 'danger', when: [{ metric: 'complexityScore', op: '>=', value: 22 }],
      title: 'Complejidad muy alta',
      text: 'Proyecto grande para un perfil junior: dividilo en fases, pedí revisión de alguien con más experiencia y sumá colchón de tiempo.' },
    { id: 'complex-high', level: 'warn', when: [{ metric: 'complexityScore', op: '>=', value: 13 }, { metric: 'complexityScore', op: '<', value: 22 }],
      title: 'Complejidad alta',
      text: 'Hay varias piezas que se afectan entre sí. Priorizá un MVP chico y validá cada módulo antes de seguir.' },
    { id: 'payments', level: 'warn', when: [{ metric: 'flag_payments', op: '==', value: 1 }],
      title: 'Pagos online: seguridad y normativa',
      text: 'Delegá el cobro en una pasarela confiable (nunca guardes datos de tarjetas), probá en modo sandbox y definí reembolsos y facturación.' },
    { id: 'auth', level: 'warn', when: [{ metric: 'flag_auth', op: '==', value: 1 }],
      title: 'Manejo de usuarios y datos personales',
      text: 'Hay que proteger contraseñas y sesiones, y cumplir la Ley 25.326 de Protección de Datos Personales (Argentina). Suma pruebas de seguridad.' },
    { id: 'backend-adv', level: 'warn', when: [{ metric: 'backendLevel', op: '==', value: 3 }],
      title: 'Backend avanzado',
      text: 'Roles, tiempo real o colas requieren arquitectura, pruebas de carga y monitoreo. Es donde más se subestima el esfuerzo.' },
    { id: 'ai-high', level: 'warn', when: [{ metric: 'aiLevel', op: '>=', value: 2 }],
      title: 'Costo variable de IA',
      text: 'El gasto de API depende del uso real y puede crecer sin aviso. Definí límites, caché y quién paga el consumo.' },
    { id: 'ai-low', level: 'info', when: [{ metric: 'aiLevel', op: '==', value: 1 }],
      title: 'IA básica: aclarar quién paga la API',
      text: 'El consumo mensual de la API es un costo recurrente aparte del desarrollo.' },
    { id: 'tools-many', level: 'warn', when: [{ metric: 'tools', op: '>=', value: 7 }],
      title: 'Muchas herramientas: riesgo de integración',
      text: 'Cada tecnología nueva suma curva de aprendizaje y puntos de falla. Revisá si todas son realmente necesarias.' },
    { id: 'mvps-many', level: 'warn', when: [{ metric: 'mvps', op: '>=', value: 3 }],
      title: 'Alcance cambiante',
      text: 'Con 3 o más MVPs es probable que el alcance se mueva. Cerrá por escrito qué entra en cada entrega.' },
    { id: 'pages-many', level: 'warn', when: [{ metric: 'pages', op: '>=', value: 15 }],
      title: 'Muchas páginas',
      text: 'Pensá en componentes reutilizables o un CMS para no maquetar cada página a mano.' },
    { id: 'features-many', level: 'warn', when: [{ metric: 'features', op: '>=', value: 5 }],
      title: 'Muchas funcionalidades extra',
      text: 'Cada una agrega pruebas e interacciones con las demás. Considerá entregarlas en etapas.' },
    { id: 'design-premium', level: 'info', when: [{ metric: 'designLevel', op: '>=', value: 3 }],
      title: 'Diseño premium: pactá las rondas de revisión',
      text: 'Definí cuántas rondas de cambios incluye el precio para no regalar horas.' },
    { id: 'content-client', level: 'info', when: [{ metric: 'contentLevel', op: '==', value: 0 }],
      title: 'Contenido a cargo del cliente',
      text: 'Fijá una fecha límite para recibir textos e imágenes: es la causa más común de proyectos demorados.' },
    { id: 'content-all', level: 'info', when: [{ metric: 'contentLevel', op: '==', value: 2 }],
      title: 'Hay que crear todo el contenido',
      text: 'Redactar y conseguir imágenes suma horas y requiere aprobación del cliente antes de maquetar.' },
    { id: 'no-maintenance', level: 'warn', when: [{ metric: 'maintenanceLevel', op: '==', value: 0 }],
      title: 'Sin mantenimiento',
      text: 'Sin actualizaciones ni backups aumenta el riesgo de fallas y seguridad. Ofrecé al menos un plan básico.' }
  ],

  /* --- CONTACTO (datos del portfolio de Thiago) ------------------------------------------------------ */
  contact: {
    name: 'Thiago Da Graca',
    role: 'Desarrollador junior · Estudiante de Sistemas (UNLa)',
    email: 'dagracathiago@gmail.com',
    whatsapp: '5491128368281',
    whatsappLabel: '+54 11 2836-8281',
    linkedin: 'https://www.linkedin.com/in/thiago-da-graca',
    github: 'https://github.com/dagracathiago-hash',
    ctaText: 'Soy Thiago, desarrollador junior. Si te sirvió esta estimación, contame tu idea y la convertimos en una propuesta concreta, con alcance, etapas y fechas claras.'
  }
};

/* --- CONFIG REMOTA (opcional, para usar con un backend más adelante) -------------------------------
   Si pones una URL acá, al abrir la página se descarga un JSON con la misma forma que CONFIG
   y reemplaza las claves que traiga. Con null el cotizador funciona 100% sin servidor. */
const CONFIG_URL = null; // ejemplo: './config.json'  ó  '/api/cotizador/config'

/* Claves de localStorage (preferencias del navegador; todo es opcional) */
const STORAGE = { state: 'cotizador-state', theme: 'cotizador-theme' };


/* =============================================================================
   2. UTILIDADES
   ============================================================================= */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sum = (list) => list.reduce((total, n) => total + n, 0);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const byId = (list, id) => list.find((item) => item.id === id) || list[0];
const indexOfId = (list, id) => Math.max(0, list.findIndex((item) => item.id === id));
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const deepCopy = (value) => JSON.parse(JSON.stringify(value));
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Escapa texto antes de insertarlo como HTML (los textos vienen de CONFIG, pero por prolijidad) */
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* localStorage puede fallar (modo privado, archivo local): siempre dentro de try/catch */
function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* sin persistencia: no pasa nada */ }
}


/* =============================================================================
   3. ESTADO
   state = lo que el usuario eligió en el formulario (+ moneda y dólar).
   ============================================================================= */

function defaultState() {
  return {
    ...deepCopy(CONFIG.defaultState),
    usdToArs: CONFIG.currency.usdToArs,
    currency: CONFIG.currency.default
  };
}

/* Valida cualquier objeto (formulario, localStorage, ejemplo) y devuelve un estado seguro */
function sanitizeState(raw = {}) {
  const base = defaultState();
  const L = CONFIG.limits;

  const int = (value, limit, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? clamp(n, limit.min, limit.max) : fallback;
  };
  const option = (list, id, fallback) => (list.some((o) => o.id === id) ? id : fallback);

  const weeksRaw = raw.desiredWeeks;
  const weeksEmpty = weeksRaw === null || weeksRaw === undefined || weeksRaw === '' || Number(weeksRaw) <= 0;
  const rate = Number(raw.usdToArs);

  return {
    type:         option(CONFIG.types, raw.type, base.type),
    pages:        int(raw.pages, L.pages, base.pages),
    desiredWeeks: weeksEmpty ? null : int(weeksRaw, L.desiredWeeks, null),
    mvps:         int(raw.mvps, L.mvps, base.mvps),
    backend:      option(CONFIG.backend, raw.backend, base.backend),
    tools:        int(raw.tools, L.tools, base.tools),
    features:     CONFIG.features.filter((f) => (raw.features || []).includes(f.id)).map((f) => f.id),
    ai:           option(CONFIG.ai, raw.ai, base.ai),
    design:       option(CONFIG.design, raw.design, base.design),
    content:      option(CONFIG.content, raw.content, base.content),
    maintenance:  option(CONFIG.maintenance, raw.maintenance, base.maintenance),
    usdToArs:     Number.isFinite(rate) && rate > 0 ? rate : base.usdToArs,
    currency:     raw.currency === 'USD' || raw.currency === 'ARS' ? raw.currency : base.currency
  };
}

let state = defaultState();
let result = null;          // último resultado de calculate()
let stageView = 1;          // escenario que se muestra en el desglose (0 mín, 1 rec, 2 premium)
let lastCurrency = null;    // para saber cuándo animar los números


/* =============================================================================
   4. MOTOR DE CÁLCULO
   Todo en USD. Estas funciones no leen ni escriben el DOM.
   ============================================================================= */

/* Calcula un escenario completo (i = 0 mínimo, 1 recomendado, 2 premium) */
function calcScenario(i, st, sel) {
  const C = CONFIG;
  const rate = C.hourlyRateUsd[i];
  const lines = []; // cada línea: { factor, stage, hours, fixed }
  const add = (factor, stage, hours, fixed = 0) => lines.push({ factor, stage, hours, fixed });

  /* 1) Horas de cada componente del proyecto */
  add('type',    'frontend', sel.type.frontendHours[i]);
  add('type',    'backend',  sel.type.backendHours[i]);
  add('pages',   'frontend', st.pages * sel.type.hoursPerPage[i]);
  add('design',  'design',   sel.design.baseHours[i] + st.pages * sel.design.hoursPerPage[i], sel.design.fixedUsd[i]);
  add('content', 'design',   st.pages * sel.content.hoursPerPage[i], sel.content.fixedUsd[i]);
  add('backend', 'backend',  sel.backend.hours[i], sel.backend.fixedUsd[i]);
  add('tools',   'backend',  st.tools * C.tools.hoursPerTool[i], st.tools * C.tools.fixedUsdPerTool[i]);
  sel.features.forEach((f) => add('features', f.stage, f.hours[i], f.fixedUsd[i]));
  add('ai',      'ai',       sel.ai.hours[i], sel.ai.fixedUsd[i]);

  /* 2) MVPs adicionales: % de las horas acumuladas hasta acá */
  const devHours = sum(lines.map((l) => l.hours));
  add('mvps', 'mvp', (st.mvps - 1) * C.mvp.extraPct[i] * devHours);

  /* 3) Etapas de gestión: % de las horas de desarrollo + MVPs */
  const coreHours = sum(lines.map((l) => l.hours));
  let overheadPct = 0;
  C.stages.filter((s) => s.pct).forEach((s) => {
    overheadPct += s.pct[i];
    add('overhead', s.id, coreHours * s.pct[i]);
  });

  /* 4) Resumen por etapa: horas, semanas y costo */
  const capacity = C.weeklyCapacityHours[i];
  const stages = C.stages.map((s) => {
    const own = lines.filter((l) => l.stage === s.id);
    const hours = sum(own.map((l) => l.hours));
    return {
      id: s.id,
      label: s.label,
      hours,
      weeks: hours / capacity,
      costUsd: hours * rate + sum(own.map((l) => l.fixed))
    };
  });
  const totalHours = sum(stages.map((s) => s.hours));
  const weeks = totalHours / capacity;
  const baseUsd = sum(stages.map((s) => s.costUsd));

  /* 5) Recargo por urgencia: compara semanas estimadas con las que pide el cliente */
  const rushRatio = st.desiredWeeks ? weeks / st.desiredWeeks : 0;
  const rushTier = C.rush.find((t) => t.maxRatio === null || rushRatio <= t.maxRatio);
  const rushMult = rushTier.mult[i];
  const totalUsd = baseUsd * rushMult;

  /* 6) Aporte de cada factor al costo (la gestión se reparte proporcionalmente entre los factores) */
  const factorUsd = {};
  lines.filter((l) => l.factor !== 'overhead').forEach((l) => {
    factorUsd[l.factor] = (factorUsd[l.factor] || 0) + l.hours * (1 + overheadPct) * rate + l.fixed;
  });
  factorUsd.rush = baseUsd * (rushMult - 1);

  /* 7) Costos recurrentes por mes */
  const monthlyUsd =
    sel.maintenance.monthlyUsd[i] +
    sel.backend.hostingMonthlyUsd[i] +
    st.tools * C.tools.monthlyUsdPerTool[i] +
    sel.ai.monthlyUsd[i] +
    sum(sel.features.map((f) => f.monthlyUsd[i]));

  /* 8) Rango: valor puntual ± margen */
  const spread = C.rangeSpread[i];
  const lowUsd = totalUsd * (1 - spread);
  const highUsd = totalUsd * (1 + spread);
  const monthlyLow = monthlyUsd * (1 - spread);
  const monthlyHigh = monthlyUsd * (1 + spread);

  return {
    index: i,
    totalUsd, baseUsd, lowUsd, highUsd,
    hours: totalHours, weeks, stages,
    rushRatio, rushTier, rushMult,
    factorUsd,
    monthlyUsd, monthlyLow, monthlyHigh,
    yearLowUsd: lowUsd + monthlyLow * C.horizonMonths,
    yearHighUsd: highUsd + monthlyHigh * C.horizonMonths
  };
}

/* Puntaje de complejidad (0 → gaugeMax) y nivel textual */
function calcComplexity(st, sel, recommended) {
  const C = CONFIG.complexity;
  const W = C.weights;
  const score =
    sel.type.complexity * W.perTypeLevel +
    st.pages * W.perPage +
    (st.mvps - 1) * W.perExtraMvp +
    st.tools * W.perTool +
    sel.features.length * W.perFeature +
    sel.ai.complexity +
    sel.backend.complexity +
    recommended.rushTier.points;

  const levelIndex = C.levels.findIndex((l) => l.max === null || score < l.max);

  /* El medidor se divide en tramos iguales (uno por nivel) para que el marcador
     coincida con las etiquetas Baja / Media / Alta / Muy alta */
  const lower = levelIndex === 0 ? 0 : C.levels[levelIndex - 1].max;
  const upper = C.levels[levelIndex].max ?? C.gaugeMax;
  const inLevel = clamp((score - lower) / (upper - lower), 0, 1);

  return {
    score,
    levelIndex,
    label: C.levels[levelIndex].label,
    position: (levelIndex + inLevel) / C.levels.length
  };
}

/* Métricas que leen las reglas de alertas */
function buildMetrics(st, sel, recommended, complexity) {
  return {
    pages: st.pages,
    mvps: st.mvps,
    tools: st.tools,
    features: sel.features.length,
    rushRatio: recommended.rushRatio,
    complexityScore: complexity.score,
    aiLevel: indexOfId(CONFIG.ai, st.ai),
    backendLevel: indexOfId(CONFIG.backend, st.backend),
    designLevel: indexOfId(CONFIG.design, st.design),
    contentLevel: indexOfId(CONFIG.content, st.content),
    maintenanceLevel: indexOfId(CONFIG.maintenance, st.maintenance),
    flag_payments: sel.features.some((f) => f.flag === 'payments') ? 1 : 0,
    flag_auth: sel.features.some((f) => f.flag === 'auth') ? 1 : 0
  };
}

function compare(left, op, right) {
  switch (op) {
    case '>':  return left > right;
    case '>=': return left >= right;
    case '<':  return left < right;
    case '<=': return left <= right;
    default:   return left === right;
  }
}

const ALERT_ORDER = { danger: 0, warn: 1, info: 2 };

function evaluateAlerts(metrics) {
  return CONFIG.alertRules
    .filter((rule) => rule.when.every((c) => compare(metrics[c.metric], c.op, c.value)))
    .sort((a, b) => ALERT_ORDER[a.level] - ALERT_ORDER[b.level]);
}

/* Función principal: del estado al resultado completo */
function calculate(st) {
  const C = CONFIG;
  const sel = {
    type:        byId(C.types, st.type),
    backend:     byId(C.backend, st.backend),
    ai:          byId(C.ai, st.ai),
    design:      byId(C.design, st.design),
    content:     byId(C.content, st.content),
    maintenance: byId(C.maintenance, st.maintenance),
    features:    C.features.filter((f) => st.features.includes(f.id))
  };

  const scenarios = [0, 1, 2].map((i) => calcScenario(i, st, sel));
  const recommended = scenarios[1];
  const complexity = calcComplexity(st, sel, recommended);
  const metrics = buildMetrics(st, sel, recommended, complexity);

  return { state: st, sel, scenarios, complexity, metrics, alerts: evaluateAlerts(metrics) };
}

/* Presupuesto medio por tipo de sitio (para la sección "Referencia rápida") */
function calcBenchmark() {
  const rows = CONFIG.types.map((type) => {
    const st = sanitizeState({
      ...CONFIG.benchmark,
      type: type.id,
      pages: type.typicalPages,
      features: type.benchmarkFeatures,
      usdToArs: state.usdToArs,
      currency: state.currency
    });
    const [min, rec, premium] = calculate(st).scenarios;
    return { type, pages: type.typicalPages, recUsd: rec.totalUsd, lowUsd: min.lowUsd, highUsd: premium.highUsd, weeks: rec.weeks };
  });
  return rows.sort((a, b) => a.recUsd - b.recUsd);
}


/* =============================================================================
   5. FORMATO Y RESUMEN PARA COPIAR
   ============================================================================= */

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0, useGrouping: 'always' });
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/* Convierte USD a la moneda pedida */
const convert = (usd, currency) => (currency === 'ARS' ? usd * state.usdToArs : usd);

/* Redondea un rango: el mínimo hacia abajo y el máximo hacia arriba */
function displayRange(lowUsd, highUsd, currency, stepTable = CONFIG.currency.rounding) {
  const step = stepTable[currency];
  return {
    low: Math.floor(convert(lowUsd, currency) / step) * step,
    high: Math.ceil(convert(highUsd, currency) / step) * step
  };
}

/* Importe puntual redondeado (etapas, factores) */
function displayAmount(usd, currency) {
  const step = CONFIG.currency.stepStage[currency];
  return Math.round(convert(usd, currency) / step) * step;
}

const money = (value, currency) => `${currency} ${nf.format(value)}`;
const rangeText = (low, high, currency) => `${currency} ${nf.format(low)} – ${nf.format(high)}`;
const otherCurrency = (currency) => (currency === 'ARS' ? 'USD' : 'ARS');

function formatWeeks(weeks) {
  if (weeks < 1) return `${Math.max(1, Math.ceil(weeks * 5))} días háb.`;
  return `${nf1.format(weeks)} sem`;
}
const formatHours = (hours) => `${nf.format(Math.round(hours))} h`;

/* Rango de un escenario en una moneda, como texto */
function scenarioRangeText(s, currency) {
  const r = displayRange(s.lowUsd, s.highUsd, currency);
  return rangeText(r.low, r.high, currency);
}

/* Top 3 de factores que más encarecen (escenario recomendado) */
function topFactors(res) {
  const rec = res.scenarios[1];
  const detail = {
    type:     res.sel.type.label,
    pages:    `${res.state.pages} ${res.state.pages === 1 ? 'página' : 'páginas'}`,
    design:   res.sel.design.label,
    content:  res.sel.content.label,
    backend:  res.sel.backend.label,
    tools:    `${res.state.tools} ${res.state.tools === 1 ? 'herramienta' : 'herramientas'}`,
    features: res.sel.features.map((f) => f.label).join(', ') || 'Ninguna',
    ai:       res.sel.ai.label,
    mvps:     `${res.state.mvps} MVPs (${res.state.mvps - 1} adicionales)`,
    rush:     `Pedido: ${res.state.desiredWeeks} sem · Estimado: ${formatWeeks(rec.weeks)}`
  };

  return Object.entries(rec.factorUsd)
    .filter(([, usd]) => usd > 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, usd]) => ({
      id,
      usd,
      share: usd / rec.totalUsd,
      label: CONFIG.factors[id].label,
      detail: detail[id] || CONFIG.factors[id].why,
      why: CONFIG.factors[id].why
    }));
}

/* Resumen de texto plano para pegar en un mensaje, mail o documento */
function buildSummary(res, { short = false } = {}) {
  const cur = res.state.currency;
  const alt = otherCurrency(cur);
  const [min, rec, premium] = res.scenarios;
  const date = new Date().toLocaleDateString('es-AR');
  const featuresText = res.sel.features.map((f) => f.label).join(', ') || 'ninguna';
  const deadline = res.state.desiredWeeks ? `${res.state.desiredWeeks} semanas` : 'flexible';

  if (short) {
    return [
      `Proyecto: ${res.sel.type.label}, ${res.state.pages} páginas, ${res.state.mvps} MVP(s).`,
      `Rango recomendado: ${scenarioRangeText(rec, cur)} (≈ ${scenarioRangeText(rec, alt)}), ~${formatWeeks(rec.weeks)}.`,
      `Plazo deseado: ${deadline}. Complejidad: ${res.complexity.label}.`
    ].join('\n');
  }

  const lines = [];
  lines.push('COTIZACIÓN ESTIMADA · SITIO WEB');
  lines.push(`Generada el ${date} · Dólar de referencia: 1 USD = ARS ${nf.format(res.state.usdToArs)}`);
  lines.push('');
  lines.push('PROYECTO');
  lines.push(`• Tipo de sitio: ${res.sel.type.label}`);
  lines.push(`• Páginas: ${res.state.pages} · MVPs: ${res.state.mvps} · Herramientas: ${res.state.tools}`);
  lines.push(`• Backend: ${res.sel.backend.label}`);
  lines.push(`• Funcionalidades: ${featuresText}`);
  lines.push(`• IA: ${res.sel.ai.label}`);
  lines.push(`• Diseño: ${res.sel.design.label}`);
  lines.push(`• Contenido: ${res.sel.content.label}`);
  lines.push(`• Mantenimiento: ${res.sel.maintenance.label}`);
  lines.push(`• Plazo deseado: ${deadline}`);
  lines.push('');
  lines.push('RANGO DE PRESUPUESTO (pago único)');
  res.scenarios.forEach((s, i) => {
    lines.push(`• ${CONFIG.scenarios[i].label}: ${scenarioRangeText(s, cur)} (≈ ${scenarioRangeText(s, alt)}) · ~${formatWeeks(s.weeks)}`);
  });
  lines.push('');
  lines.push('COSTOS RECURRENTES (por mes)');
  res.scenarios.forEach((s, i) => {
    const r = displayRange(s.monthlyLow, s.monthlyHigh, cur, CONFIG.currency.stepMonthly);
    lines.push(`• ${CONFIG.scenarios[i].label}: ${rangeText(r.low, r.high, cur)}`);
  });
  lines.push('');
  lines.push('ETAPAS (escenario recomendado)');
  rec.stages.filter((s) => s.hours > 0.05).forEach((s) => {
    lines.push(`• ${s.label}: ${formatHours(s.hours)} · ${formatWeeks(s.weeks)} · ${money(displayAmount(s.costUsd, cur), cur)}`);
  });
  lines.push(`Duración total estimada: ${formatWeeks(rec.weeks)} (${formatHours(rec.hours)})`);
  lines.push('');
  lines.push(`ALERTAS DE COMPLEJIDAD · Nivel: ${res.complexity.label}`);
  if (res.alerts.length) res.alerts.forEach((a) => lines.push(`• [${a.level === 'danger' ? 'Crítica' : a.level === 'warn' ? 'Atención' : 'Info'}] ${a.title}`));
  else lines.push('• Sin alertas relevantes');
  lines.push('');
  lines.push('LO QUE MÁS ENCARECE EL PROYECTO');
  topFactors(res).forEach((f, n) => lines.push(`${n + 1}. ${f.label} — ${f.detail} (${Math.round(f.share * 100)}% del total)`));
  lines.push('');
  lines.push('Estimación orientativa con valores ficticios. No constituye un precio final ni una oferta comercial.');
  lines.push(`Contacto: ${CONFIG.contact.name} · ${CONFIG.contact.email}`);
  return lines.join('\n');
}


/* =============================================================================
   6. VISTA (dibuja resultados en el DOM)
   ============================================================================= */

const els = {};  // referencias al DOM, se completan en init()

/* Cambia un número en pantalla con una animación corta (si se puede) */
function setNumber(el, value, animate) {
  const from = el._value === undefined ? value : el._value;
  el._value = value;
  clearTimeout(el._timer);
  cancelAnimationFrame(el._raf);

  if (!animate || prefersReducedMotion || from === value) {
    el.textContent = nf.format(value);
    return;
  }

  const start = performance.now();
  const duration = 350;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = nf.format(Math.round(from + (value - from) * eased));
    if (t < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
  // Respaldo: si la pestaña está en segundo plano, igual queda el valor final
  el._timer = setTimeout(() => { el.textContent = nf.format(value); }, duration + 60);
}

/* Arma las 3 tarjetas de precio una sola vez; después solo se actualizan sus textos */
function buildPriceCards() {
  els.priceCards.innerHTML = CONFIG.scenarios.map((s) => `
    <article class="price-card ${s.featured ? 'price-card--featured' : ''}">
      <header class="price-card__head">
        <h3 class="price-card__title">${esc(s.label)}</h3>
        ${s.badge ? `<span class="badge badge--accent">${icon('star')}${esc(s.badge)}</span>` : ''}
      </header>
      <p class="price-card__tag">${esc(s.tagline)}</p>
      <p class="price">
        <span class="price__cur" data-role="cur"></span>
        <span data-role="low">0</span><span class="price__dash">–</span><span data-role="high">0</span>
      </p>
      <p class="price-card__alt" data-role="alt"></p>
      <ul class="price-card__meta">
        <li>${icon('clock')}<span data-role="time"></span></li>
        <li>${icon('layers')}<span data-role="hours"></span></li>
      </ul>
    </article>`).join('');

  els.cards = $$('.price-card', els.priceCards).map((card) => ({
    cur: $('[data-role=cur]', card),
    low: $('[data-role=low]', card),
    high: $('[data-role=high]', card),
    alt: $('[data-role=alt]', card),
    time: $('[data-role=time]', card),
    hours: $('[data-role=hours]', card)
  }));
}

function renderPrices(res, animate) {
  const cur = res.state.currency;
  const alt = otherCurrency(cur);

  res.scenarios.forEach((s, i) => {
    const card = els.cards[i];
    const r = displayRange(s.lowUsd, s.highUsd, cur);
    card.cur.textContent = cur;
    setNumber(card.low, r.low, animate);
    setNumber(card.high, r.high, animate);
    card.alt.textContent = `≈ ${scenarioRangeText(s, alt)}`;
    card.time.textContent = `~${formatWeeks(s.weeks)} de trabajo`;
    card.hours.textContent = formatHours(s.hours);
  });
}

function renderRecurring(res) {
  const cur = res.state.currency;
  const rows = res.scenarios.map((s, i) => {
    const m = displayRange(s.monthlyLow, s.monthlyHigh, cur, CONFIG.currency.stepMonthly);
    const y = displayRange(s.yearLowUsd, s.yearHighUsd, cur);
    return `
      <div class="table__row">
        <div class="table__cell"><strong>${esc(CONFIG.scenarios[i].label)}</strong></div>
        <div class="table__cell"><small>Por mes</small><strong>${rangeText(m.low, m.high, cur)}</strong></div>
        <div class="table__cell"><small>Primer año (${CONFIG.horizonMonths} meses, todo incluido)</small><strong>${rangeText(y.low, y.high, cur)}</strong></div>
      </div>`;
  }).join('');

  els.recurring.innerHTML = `
    <div class="table__row table__row--head" aria-hidden="true"><span>Escenario</span><span>Mensual</span><span>Total primer año</span></div>
    ${rows}`;
}

function renderStages(res) {
  const cur = res.state.currency;
  const s = res.scenarios[stageView];
  const visible = s.stages.filter((st) => st.hours > 0.05);
  const maxHours = Math.max(...visible.map((st) => st.hours));

  els.stageTabs.innerHTML = CONFIG.scenarios.map((sc, i) =>
    `<button type="button" class="segmented__btn ${i === stageView ? 'is-active' : ''}" data-stage-view="${i}" aria-pressed="${i === stageView}">${esc(sc.label)}</button>`
  ).join('');

  els.stages.innerHTML = visible.map((st) => `
    <div class="stage">
      <span class="stage__name">${esc(st.label)}</span>
      <span class="stage__time">${formatWeeks(st.weeks)}</span>
      <span class="stage__bar"><i style="--w:${Math.max(3, (st.hours / maxHours) * 100).toFixed(1)}%"></i></span>
      <span class="stage__meta">${formatHours(st.hours)} · ≈ ${money(displayAmount(st.costUsd, cur), cur)}</span>
    </div>`).join('');

  const rush = s.rushMult > 1
    ? `<span>Recargo por urgencia (×${nf1.format(s.rushMult)}) <span class="mono">+ ${money(displayAmount(s.baseUsd * (s.rushMult - 1), cur), cur)}</span></span>`
    : '';
  els.stagesFoot.innerHTML = `
    <span>Duración total: <span class="mono">${formatWeeks(s.weeks)} · ${formatHours(s.hours)}</span></span>
    ${rush}`;
}

function renderComplexity(res) {
  const { complexity, alerts } = res;
  els.gauge.style.setProperty('--pos', `${(complexity.position * 100).toFixed(1)}%`);

  const tone = ['badge--teal', 'badge--accent', 'badge--accent', 'badge--danger'][complexity.levelIndex] || '';
  els.complexityBadge.className = `badge ${tone}`;
  els.complexityBadge.textContent = `Complejidad ${complexity.label.toLowerCase()}`;

  const iconFor = { danger: 'alert', warn: 'alert', info: 'info' };
  els.alerts.innerHTML = alerts.length
    ? alerts.map((a) => `
        <div class="alert alert--${a.level}">
          ${icon(iconFor[a.level])}
          <div><strong>${esc(a.title)}</strong><p>${esc(a.text)}</p></div>
        </div>`).join('')
    : `<div class="alert alert--ok">${icon('check-circle')}<div><strong>Sin alertas relevantes</strong><p>Con estas opciones el proyecto es manejable. Igual, validá el alcance con el cliente.</p></div></div>`;
}

function renderFactors(res) {
  const cur = res.state.currency;
  els.factors.innerHTML = topFactors(res).map((f, n) => `
    <div class="factor">
      <span class="factor__rank">${n + 1}</span>
      <div>
        <p class="factor__name">${esc(f.label)}</p>
        <p class="factor__detail">${esc(f.detail)}</p>
      </div>
      <span class="factor__amount">${money(displayAmount(f.usd, cur), cur)}<small>${Math.round(f.share * 100)}% del total</small></span>
      <span class="factor__bar"><i style="--w:${(f.share * 100).toFixed(1)}%"></i></span>
    </div>`).join('');
}

function renderBenchmark(res) {
  const cur = res.state.currency;
  const rows = calcBenchmark();
  const max = Math.max(...rows.map((r) => r.recUsd));

  els.benchmark.innerHTML = rows.map((r) => {
    const range = displayRange(r.lowUsd, r.highUsd, cur);
    const current = r.type.id === res.state.type;
    return `
      <button type="button" class="bench ${current ? 'is-current' : ''}" data-type="${r.type.id}" ${current ? 'aria-current="true"' : ''}>
        <span class="bench__name">${esc(r.type.label)}<small>demanda ${esc(r.type.demand.toLowerCase())}</small></span>
        <span class="bench__value">${money(displayAmount(r.recUsd, cur), cur)}</span>
        <span class="bench__bar"><i style="--w:${((r.recUsd / max) * 100).toFixed(1)}%"></i></span>
        <span class="bench__range">Rango ${rangeText(range.low, range.high, cur)} · ${r.pages} ${r.pages === 1 ? 'página' : 'páginas'} · ~${formatWeeks(r.weeks)}</span>
      </button>`;
  }).join('');
}

/* Textos de ayuda que cambian según lo elegido */
function renderHints(res) {
  const cur = res.state.currency;
  const rec = res.scenarios[1];

  els.benchNote.textContent = `1 USD = ARS ${nf.format(res.state.usdToArs)}`;
  els.typeHint.textContent = `Demanda ${res.sel.type.demand.toLowerCase()} · ${res.sel.type.hint}`;
  els.weeksHint.textContent = `Estimado recomendado: ~${formatWeeks(rec.weeks)}`;

  const monthlyRange = (from, to) => {
    const r = displayRange(from, to, cur, CONFIG.currency.stepMonthly);
    return rangeText(r.low, r.high, cur);
  };
  els.backendHint.textContent = `Hosting y dominio: ${monthlyRange(res.sel.backend.hostingMonthlyUsd[0], res.sel.backend.hostingMonthlyUsd[2])} por mes`;
  els.aiHint.textContent = res.sel.ai.monthlyUsd[2] > 0
    ? `API de IA: ${monthlyRange(res.sel.ai.monthlyUsd[0], res.sel.ai.monthlyUsd[2])} por mes`
    : 'Sin gasto mensual de IA';
  els.maintHint.textContent = res.sel.maintenance.monthlyUsd[2] > 0
    ? `Plan: ${monthlyRange(res.sel.maintenance.monthlyUsd[0], res.sel.maintenance.monthlyUsd[2])} por mes`
    : 'Sin costo mensual de mantenimiento';
}

/* Botones de contacto con el resumen corto ya cargado en el mensaje */
function renderContact(res) {
  const c = CONFIG.contact;
  const message = `Hola Thiago, usé tu Cotizador Web y me gustaría hablar de este proyecto:\n${buildSummary(res, { short: true })}`;
  const wa = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(message)}`;
  const mail = `mailto:${c.email}?subject=${encodeURIComponent('Consulta de proyecto web')}&body=${encodeURIComponent(message)}`;

  els.ctaText.textContent = c.ctaText;
  els.contactLinks.innerHTML = `
    <a class="btn btn--primary" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')}Pedir propuesta por WhatsApp</a>
    <a class="btn btn--secondary" href="${mail}">${icon('mail')}Escribirme un email</a>
    <a class="btn btn--secondary btn--sm" href="${esc(c.linkedin)}" target="_blank" rel="noopener">${icon('linkedin')}LinkedIn</a>
    <a class="btn btn--secondary btn--sm" href="${esc(c.github)}" target="_blank" rel="noopener">${icon('github')}GitHub</a>`;
}

function renderMobileBar(res) {
  const cur = res.state.currency;
  els.mobileValue.textContent = scenarioRangeText(res.scenarios[1], cur);
}

function renderCurrencyButtons() {
  $$('[data-currency]').forEach((btn) => {
    const active = btn.dataset.currency === state.currency;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

/* Dibuja TODO el resultado. animate=false cuando cambia la moneda (los números no se "interpolan") */
function render(animate = true) {
  const shouldAnimate = animate && lastCurrency === state.currency;
  lastCurrency = state.currency;

  renderCurrencyButtons();
  renderPrices(result, shouldAnimate);
  renderRecurring(result);
  renderStages(result);
  renderComplexity(result);
  renderFactors(result);
  renderBenchmark(result);
  renderHints(result);
  renderContact(result);
  renderMobileBar(result);
}


/* =============================================================================
   7. EVENTOS E INICIALIZACIÓN
   ============================================================================= */

/* Lee el formulario y lo convierte en un estado válido */
function readForm() {
  return sanitizeState({
    type: els.type.value,
    pages: els.pages.value,
    desiredWeeks: els.desiredWeeks.value,
    mvps: els.mvps.value,
    backend: els.backend.value,
    tools: els.tools.value,
    features: $$('input[name=feature]:checked', els.features).map((input) => input.value),
    ai: els.ai.value,
    design: els.design.value,
    content: els.content.value,
    maintenance: els.maintenance.value,
    usdToArs: els.usdToArs.value,
    currency: state.currency
  });
}

/* Escribe el estado en el formulario */
function writeForm(st) {
  els.type.value = st.type;
  els.pages.value = st.pages;
  els.desiredWeeks.value = st.desiredWeeks ?? '';
  els.mvps.value = st.mvps;
  els.backend.value = st.backend;
  els.tools.value = st.tools;
  $$('input[name=feature]', els.features).forEach((input) => { input.checked = st.features.includes(input.value); });
  els.ai.value = st.ai;
  els.design.value = st.design;
  els.content.value = st.content;
  els.maintenance.value = st.maintenance;
  els.usdToArs.value = st.usdToArs;
}

/* Recalcula y dibuja. Se llama cada vez que algo cambia */
function update({ animate = true, persist = true } = {}) {
  result = calculate(state);
  render(animate);
  if (persist) storageSet(STORAGE.state, JSON.stringify(state));
}

function applyState(next, options) {
  state = sanitizeState(next);
  writeForm(state);
  update(options);
}

function fillSelect(select, list) {
  select.innerHTML = list.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');
}

/* Construye selects, casillas, ejemplos y tabs a partir de CONFIG */
function buildControls() {
  fillSelect(els.type, CONFIG.types);
  fillSelect(els.backend, CONFIG.backend);
  fillSelect(els.ai, CONFIG.ai);
  fillSelect(els.design, CONFIG.design);
  fillSelect(els.content, CONFIG.content);
  fillSelect(els.maintenance, CONFIG.maintenance);

  els.features.innerHTML = CONFIG.features.map((f) => `
    <label class="check"><input type="checkbox" name="feature" value="${esc(f.id)}"><span>${esc(f.label)}</span></label>`).join('');

  els.presets.innerHTML = CONFIG.presets.map((p) =>
    `<button type="button" class="chip" data-preset="${esc(p.id)}">${esc(p.label)}</button>`).join('');

  // Límites de los campos numéricos (salen de CONFIG.limits)
  Object.entries(CONFIG.limits).forEach(([key, limit]) => {
    els[key].min = limit.min;
    els[key].max = limit.max;
  });
  els.usdToArs.min = 1;
}

/* Botones − / + de los campos numéricos */
function stepField(name, direction) {
  const input = els[name];
  const limit = CONFIG.limits[name];
  const current = input.value === '' ? (name === 'desiredWeeks' ? 0 : limit.min) : Number(input.value);
  let next = current + direction;
  // En "plazo" bajar de 1 vuelve al estado "flexible" (vacío)
  if (name === 'desiredWeeks' && next < limit.min) {
    input.value = '';
  } else {
    input.value = clamp(next, limit.min, limit.max);
  }
  onFormInput();
}

function onFormInput() {
  state = readForm();
  update();
}

/* Al salir de un campo, se corrigen los valores fuera de rango */
function onFormChange() {
  state = readForm();
  writeForm(state);
  update();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('is-visible'), 2200);
}

/* Copia al portapapeles; si el navegador no deja, usa un método alternativo */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    area.remove();
    return ok;
  }
}

async function onCopy(button) {
  const ok = await copyText(buildSummary(result));
  const label = $('[data-role=label]', button);
  showToast(ok ? 'Resumen copiado al portapapeles' : 'No se pudo copiar: seleccioná el texto manualmente');
  if (!ok || !label) return;
  const original = label.textContent;
  button.classList.add('is-done');
  label.textContent = '¡Copiado!';
  setTimeout(() => { button.classList.remove('is-done'); label.textContent = original; }, 1800);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  storageSet(STORAGE.theme, theme);
  $('meta[name=theme-color]').setAttribute('content', theme === 'light' ? '#f7f4ed' : '#0a0e14');
}

function bindEvents() {
  // Formulario: cualquier cambio recalcula al instante
  els.form.addEventListener('input', onFormInput);
  els.form.addEventListener('change', onFormChange);
  els.form.addEventListener('submit', (e) => e.preventDefault());

  // Clicks delegados en toda la página
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, a');
    if (!target) return;

    const step = target.closest('[data-step]');
    if (step) {
      stepField(step.closest('[data-stepper]').dataset.stepper, Number(step.dataset.step));
      return;
    }

    if (target.dataset.currency) {
      state.currency = target.dataset.currency;
      update({ animate: false });
    } else if (target.dataset.preset) {
      const preset = CONFIG.presets.find((p) => p.id === target.dataset.preset);
      if (preset) applyState({ ...preset.state, usdToArs: state.usdToArs, currency: state.currency });
    } else if (target.dataset.action === 'reset') {
      applyState({ ...defaultState(), usdToArs: state.usdToArs, currency: state.currency });
      showToast('Formulario reiniciado');
    } else if (target.dataset.action === 'copy') {
      onCopy(target);
    } else if (target.dataset.stageView !== undefined) {
      stageView = Number(target.dataset.stageView);
      renderStages(result);
    } else if (target.dataset.type) {
      const type = byId(CONFIG.types, target.dataset.type);
      applyState({ ...state, type: type.id, pages: type.typicalPages, features: type.benchmarkFeatures });
      document.getElementById('form').scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    } else if (target.id === 'themeToggle') {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    }
  });
}

/* Descarga CONFIG desde un JSON (solo si CONFIG_URL tiene valor) */
async function loadRemoteConfig(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    Object.assign(CONFIG, await response.json());
  } catch (error) {
    console.warn('[Cotizador] No se pudo cargar la configuración remota; se usa la local.', error);
  }
}

async function init() {
  if (CONFIG_URL) await loadRemoteConfig(CONFIG_URL);

  // Referencias al DOM
  ['form', 'type', 'pages', 'desiredWeeks', 'mvps', 'backend', 'tools', 'features', 'ai', 'design', 'content',
   'maintenance', 'usdToArs', 'presets', 'priceCards', 'recurring', 'stageTabs', 'stages', 'stagesFoot',
   'gauge', 'complexityBadge', 'alerts', 'factors', 'benchmark', 'typeHint', 'weeksHint', 'backendHint',
   'aiHint', 'maintHint', 'benchNote', 'ctaText', 'contactLinks', 'mobileValue', 'toast'
  ].forEach((id) => { els[id] = document.getElementById(id); });

  document.getElementById('year').textContent = new Date().getFullYear();

  buildControls();
  buildPriceCards();
  bindEvents();

  // Estado inicial: lo último guardado en este navegador, o los valores por defecto
  let saved = null;
  try { saved = JSON.parse(storageGet(STORAGE.state)); } catch (e) { saved = null; }
  state = sanitizeState(saved || defaultState());
  writeForm(state);
  update({ animate: false, persist: false });
}

init();
