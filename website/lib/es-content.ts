import type { ReactNode } from 'react';
import type { NewPage } from './new-page-content';
import { FEATURES_ES, type SpanishFeatureFact } from './es-facts';

export type SpanishPageKind =
  | 'standard'
  | 'features-index'
  | 'feature'
  | 'pricing'
  | 'support'
  | 'gpa'
  | 'pomodoro'
  | 'blog-index'
  | 'compare-index';

export interface SpanishPageConfig {
  path: string;
  englishPath: string;
  kind: SpanishPageKind;
  content: NewPage;
  feature?: SpanishFeatureFact;
  widget?: ReactNode;
}

const page = (
  path: string,
  englishPath: string,
  kind: SpanishPageKind,
  content: NewPage,
  feature?: SpanishFeatureFact,
): SpanishPageConfig => ({ path, englishPath, kind, content, feature });

const CORE_PAGES: SpanishPageConfig[] = [
  page('/es/acerca-de', '/about', 'standard', {
    metaTitle: 'Acerca de Semora',
    metaDescription: 'Descubre cómo Semora organiza programas de clase, entregas, calificaciones y tiempo de estudio para estudiantes universitarios.',
    h1: 'Menos tiempo organizando. Más tiempo aprendiendo.',
    lede: 'Semora nació para convertir uno de los documentos más importantes del primer día —el programa de cada materia— en un semestre fácil de entender y organizar.',
    intro: [
      'Las fechas llegan en archivos PDF, plataformas académicas, correos y avisos del profesor. El problema no es la falta de esfuerzo: la información está repartida entre demasiados lugares.',
      'Semora reúne todo en una sola cuenta disponible en iPhone, iPad y la web. Tú revisas los datos antes de guardarlos y mantienes el control de cada cambio.',
    ],
    sections: [
      {
        heading: 'Pensado a partir de tus cursos reales',
        paragraphs: [
          'Semora no empieza con una lista vacía. Empieza con el programa de la materia, tus tareas, horarios y calificaciones. Así, el calendario, los recordatorios, el Plan Inteligente y el Tutor con IA trabajan con el contexto académico correcto.',
          'Canvas, Blackboard y Moodle pueden complementar esa información. Si tu institución no permite una conexión directa, de todos modos puedes añadir el programa con una foto, un PDF o texto copiado.',
        ],
      },
      {
        heading: 'Claridad antes que ruido',
        paragraphs: [
          'Cada función debe responder una pregunta concreta: ¿qué tengo que entregar?, ¿cómo van mis calificaciones?, ¿qué debo estudiar hoy?, ¿por qué cambió mi plan? La idea es ayudarte, no darte otra herramienta complicada que mantener.',
        ],
        bullets: [
          'Nada extraído por IA se guarda sin revisión.',
          'Las fechas oficiales del curso tienen prioridad sobre cualquier suposición.',
          'La misma cuenta mantiene tus datos sincronizados en iPhone, iPad y la web.',
        ],
      },
      {
        heading: 'Privacidad diseñada desde el principio',
        paragraphs: [
          'Tus archivos académicos se guardan de forma privada. Las reglas de acceso impiden que una cuenta vea los datos de otra, y los servicios externos solo reciben la información necesaria para la función que decides usar.',
        ],
      },
    ],
    faq: [
      { question: '¿Semora es una escuela o plataforma LMS?', answer: 'No. Semora es una herramienta personal para organizar la información de tus cursos. Complementa Canvas, Blackboard o Moodle; no reemplaza la fuente oficial de tu institución.' },
      { question: '¿Quién puede usar Semora?', answer: 'Está pensado principalmente para estudiantes universitarios que llevan varias materias, fechas de entrega y sistemas de calificación.' },
      { question: '¿Dónde puedo usarlo?', answer: 'En iPhone, iPad y en la web con la misma cuenta.' },
    ],
  }),
  page('/es/precios', '/pricing', 'pricing', {
    metaTitle: 'Precios de Semora',
    metaDescription: 'Empieza gratis. Semora Pro cuesta $3.99 al mes o $19.99 al año e incluye planificación, IA, LMS y herramientas avanzadas.',
    h1: 'Precios simples para un semestre real',
    lede: 'Empieza gratis con lo esencial. Pásate a Pro cuando necesites cursos ilimitados, planificación adaptativa y herramientas de estudio avanzadas.',
    intro: [
      'El plan Gratis incluye cinco escaneos al mes, hasta cuatro cursos por semestre, tareas, fechas de entrega, calificaciones ponderadas y recordatorios el mismo día. No necesitas tarjeta de crédito.',
      'Pro cuesta $3.99 al mes o $19.99 al año. Puedes contratarlo desde la app con tu Apple ID y usarlo con la misma cuenta en iPhone, iPad y la web.',
    ],
    sections: [
      {
        heading: 'Cuándo vale la pena Pro',
        paragraphs: ['Pro está pensado para estudiantes que quieren organizar varios semestres, sincronizar sus plataformas académicas o convertir sus datos en un plan de estudio que se reajusta automáticamente.'],
        bullets: [
          'Cursos, semestres y escaneos ilimitados.',
          'Canvas, Blackboard y Moodle con historial de sincronización.',
          'Plan Inteligente, tarjetas, Tutor con IA y temporizador de enfoque.',
          'Pronósticos de calificaciones, alertas de riesgo y sincronización con calendarios externos.',
        ],
      },
      {
        heading: 'La suscripción sigue bajo tu control',
        paragraphs: [
          'Apple administra el cobro, la renovación y la cancelación. Puedes cancelar desde Configuración > Apple ID > Suscripciones. Tu cuenta y tus datos académicos permanecen intactos si vuelves al plan Gratis.',
        ],
      },
    ],
    faq: [
      { question: '¿Semora tiene un plan gratis?', answer: 'Sí. Incluye cinco escaneos al mes, hasta cuatro cursos por semestre, seguimiento de entregas y calificaciones, y recordatorios el mismo día.' },
      { question: '¿Cómo compro Pro?', answer: 'Dentro de la app en iPhone o iPad mediante App Store. La suscripción se activa en toda tu cuenta, incluida la web.' },
      { question: '¿Puedo cancelar cuando quiera?', answer: 'Sí. Administra o cancela la suscripción desde la configuración de tu Apple ID.' },
      { question: '¿Pierdo mis datos si cancelo?', answer: 'No. Conservas tu cuenta y los datos compatibles con el plan Gratis; solo se desactivan las funciones exclusivas de Pro.' },
    ],
  }),
  page('/es/ayuda', '/support', 'support', {
    metaTitle: 'Ayuda de Semora',
    metaDescription: 'Respuestas en español sobre el escaneo de programas, cuentas, suscripciones, calificaciones y sincronización, además de contacto directo.',
    h1: '¿Cómo podemos ayudarte?',
    lede: 'Cuéntanos qué sucede o revisa las respuestas más comunes. Los mensajes llegan a semora365@gmail.com.',
    intro: [
      'Indica qué dispositivo usas, en qué pantalla ocurrió el problema y qué esperabas que sucediera. No envíes contraseñas, tokens personales de Canvas ni información financiera.',
    ],
    sections: [
      {
        heading: 'Soluciones rápidas',
        paragraphs: ['Antes de escribirnos, comprueba que tienes conexión, que has iniciado sesión con la misma cuenta en todos tus dispositivos y que la app está actualizada.'],
        bullets: [
          'Revisa cada dato encontrado antes de guardar el programa de la materia.',
          'Usa Historial de sincronización para ver errores de Canvas, Blackboard o Moodle.',
          'Las suscripciones se administran desde tu Apple ID.',
        ],
      },
    ],
    faq: [
      { question: '¿Cómo añado el programa de una materia?', answer: 'Abre Escanear y toma una foto, sube un PDF o elige un archivo. En la web también puedes arrastrarlo o pegar el texto. Revisa el resultado antes de guardarlo.' },
      { question: '¿Puedo editar una tarea después?', answer: 'Sí. Sí. Abre la tarea y elige Editar para cambiar el título, la fecha, la hora, el tipo o la descripción.' },
      { question: '¿Cómo se calcula mi calificación?', answer: 'Semora usa las puntuaciones y ponderaciones que registras. El promedio actual solo toma en cuenta lo que ya está calificado.' },
      { question: '¿Cómo cancelo Pro?', answer: 'En tu dispositivo abre Configuración > Apple ID > Suscripciones y selecciona Semora.' },
      { question: '¿Cómo elimino mi cuenta?', answer: 'En la app, abre la pestaña Mi cuenta, desplázate hasta Eliminar cuenta y confirma. La eliminación es permanente.' },
    ],
  }),
  page('/es/privacidad', '/privacy', 'standard', {
    metaTitle: 'Política de privacidad',
    metaDescription: 'Cómo Semora recopila, usa, protege y elimina tu información académica y personal.',
    h1: 'Política de privacidad',
    lede: 'Última actualización: 8 de agosto de 2026. Esta traducción explica la misma política que la versión en inglés.',
    intro: [
      'Semora se compromete a proteger tu privacidad. Esta política describe la información que recopilamos, por qué la usamos, dónde se procesa y las opciones que tienes cuando utilizas nuestras aplicaciones y sitios web.',
    ],
    sections: [
      {
        heading: 'Información que recopilamos',
        paragraphs: ['Recopilamos solo la información necesaria para ofrecer las funciones que decides usar.'],
        bullets: [
          'Información de cuenta, como correo electrónico y credenciales protegidas.',
          'Datos académicos: semestres, cursos, tareas, apuntes, calificaciones y contenido de los programas de tus materias.',
          'Cursos y tareas de Canvas, Blackboard, Moodle o Google Classroom cuando decides conectarlos.',
          'Zona horaria, tipo de dispositivo y versión del sistema para el funcionamiento de la app.',
          'Programas de clase y apuntes que decides subir para escanearlos, crear tarjetas o usar el Tutor con IA.',
          'Datos de uso anónimos asociados a un identificador aleatorio de instalación, no a tu nombre ni a tu correo electrónico.',
          'Un identificador para enviar notificaciones si autorizas los recordatorios y datos de referidos si utilizas una invitación.',
        ],
      },
      {
        heading: 'Cómo usamos la información',
        paragraphs: ['Usamos tus datos para organizar tareas, calificaciones y calendarios; extraer información de los programas de clase; enviar recordatorios; sincronizar los cursos que elijas; ofrecer tarjetas de estudio, planificación y el Tutor con IA; y aplicar recompensas por invitaciones.'],
      },
      {
        heading: 'Almacenamiento y seguridad',
        paragraphs: [
          'Los datos se almacenan en Supabase, alojado en AWS. Los tokens de autenticación usan el almacenamiento seguro del dispositivo. La base de datos aplica seguridad a nivel de fila para que cada cuenta solo acceda a sus propios datos y los archivos se guardan en espacios privados.',
        ],
      },
      {
        heading: 'Servicios externos',
        paragraphs: [
          'Supabase proporciona la base de datos y la autenticación. OpenAI es el único proveedor de IA al que Semora envía tu contenido: lee los programas de clase, genera las tarjetas de estudio, las preguntas de práctica y los cuestionarios, y responde tus preguntas en el Tutor. Según la política de OpenAI, los datos enviados mediante la API no se utilizan para entrenar modelos salvo que el cliente lo autorice expresamente. Semora desactiva el almacenamiento de respuestas, aunque OpenAI puede conservar registros para detectar abusos durante un máximo de 30 días cuando no se aplique un control más estricto.',
          'Apple StoreKit procesa las suscripciones. Expo envía las notificaciones que autorizas. Google Calendar solo recibe las fechas que eliges sincronizar; Semora no lee tus otros eventos.',
          'De forma predeterminada, las credenciales de Canvas, Blackboard, Moodle o Google Classroom permanecen en el dispositivo. Si activas la Sincronización automática, la credencial se guarda cifrada en Supabase Vault para actualizar cursos, tareas, entregas y calificaciones mientras la app está cerrada. La credencial se elimina cuando desactivas la función o desconectas la plataforma.',
        ],
      },
      {
        heading: 'Retención, eliminación y tus derechos',
        paragraphs: [
          'Conservamos tus datos mientras la cuenta esté activa. Puedes acceder a ellos desde la app, solicitar una exportación o eliminar permanentemente la cuenta y sus archivos desde Mi cuenta > Eliminar cuenta.',
          'Semora está destinado a estudiantes universitarios y no recopila intencionalmente información de menores de 13 años. Podemos actualizar esta política y publicaremos los cambios en la app.',
        ],
      },
      {
        heading: 'Contacto',
        paragraphs: ['Para preguntas de privacidad escribe a semora365@gmail.com.'],
      },
    ],
    faq: [],
  }),
  page('/es/terminos', '/terms', 'standard', {
    metaTitle: 'Términos de servicio',
    metaDescription: 'Los términos que rigen el uso de Semora, sus funciones con IA y las suscripciones de Semora Pro.',
    h1: 'Términos de servicio',
    lede: 'Última actualización: 19 de abril de 2026. Esta traducción comunica los mismos términos que la versión en inglés.',
    intro: [
      'Al descargar, instalar o usar Semora aceptas estos Términos de servicio. Si no estás de acuerdo, no uses la app.',
    ],
    sections: [
      { heading: '1. Descripción del servicio', paragraphs: ['Semora ayuda a estudiantes a organizar tareas, fechas de entrega y calificaciones mediante el escaneo de programas de clase con IA, seguimiento académico, herramientas de estudio y sincronización con calendarios y plataformas educativas.'] },
      { heading: '2. Registro y seguridad de la cuenta', paragraphs: ['Debes crear una cuenta y eres responsable de proteger tus credenciales y de toda la actividad que se realice en ella.'] },
      { heading: '3. Suscripciones y pagos', paragraphs: ['Semora ofrece los planes Gratis y Pro. Apple App Store procesa las compras. Las suscripciones se renuevan automáticamente, salvo que las canceles al menos 24 horas antes de que termine el periodo. Puedes administrarlas desde tu Apple ID; Apple también gestiona los reembolsos de acuerdo con sus políticas. Si se ofrece una prueba gratuita, esta pasa a ser de pago si no la cancelas antes de que finalice.'] },
      { heading: '4. Límites del plan Gratis', paragraphs: ['El plan Gratis limita el número de escaneos, cursos y semestres. Pro amplía esos límites y añade personalización, sincronización, planificación y herramientas con IA. La app muestra los límites y precios vigentes antes de que realices una compra.'] },
      {
        heading: '5. Uso aceptable',
        paragraphs: ['Aceptas no usar Semora con fines ilegales ni interferir con su funcionamiento.'],
        bullets: [
          'No intentes acceder a sistemas o datos de otras personas sin autorización.',
          'No subas contenido que infrinja derechos de propiedad intelectual.',
          'No intentes descompilar el servicio, utilizarlo de forma abusiva ni eludir sus límites o controles.',
        ],
      },
      { heading: '6. Funciones con inteligencia artificial', paragraphs: ['La IA puede cometer errores. Debes revisar las fechas, calificaciones y demás resultados antes de basarte en ellos. Semora no se hace responsable de entregas vencidas ni de información incorrecta cuando el resultado no haya sido verificado.'] },
      { heading: '7. Propiedad intelectual', paragraphs: ['Semora conserva la propiedad de la aplicación, su contenido original y sus funciones. Tus datos académicos siguen siendo tuyos.'] },
      { heading: '8. Terminación', paragraphs: ['Puedes eliminar tu cuenta en cualquier momento. Podemos suspender o cancelar una cuenta que incumpla estos términos.'] },
      { heading: '9. Garantías y responsabilidad', paragraphs: ['El servicio se ofrece “tal cual”, sin garantía de funcionamiento ininterrumpido ni libre de errores. En la medida permitida por la ley, Semora no responde por daños indirectos, incidentales o consecuenciales, incluidas las entregas vencidas, los cálculos incorrectos o la pérdida de datos.'] },
      { heading: '10. Cambios y contacto', paragraphs: ['Podemos modificar estos términos. Continuar usando Semora después de un cambio constituye aceptación. Para preguntas escribe a semora365@gmail.com.'] },
    ],
    faq: [],
  }),
];

const INDEX_AND_TOOL_PAGES: SpanishPageConfig[] = [
  page('/es/funciones', '/features', 'features-index', {
    metaTitle: 'Funciones de Semora',
    metaDescription: 'Análisis de programas con IA, calificaciones, Plan Inteligente, tarjetas, Tutor, Canvas y más para organizar la universidad.',
    h1: 'Todo lo que necesitas para organizar el semestre',
    lede: 'Desde la primera foto del programa de una materia hasta la semana de finales: una sola cuenta para tus entregas, calificaciones y tiempo de estudio.',
    intro: [
      'Empieza gratis con cinco escaneos al mes, cuatro cursos, tareas, calificaciones y recordatorios. Pro añade automatización, cursos ilimitados y herramientas de estudio basadas en tus datos reales.',
    ],
    sections: [
      { heading: 'Un sistema conectado, no ocho herramientas separadas', paragraphs: ['El escaneo crea la estructura del curso. Las fechas se incorporan al calendario y al Plan Inteligente; las calificaciones sirven para crear pronósticos y recomendaciones; y tus apuntes dan contexto a las tarjetas y al Tutor.'] },
      { heading: 'Funciona donde estudias', paragraphs: [
        'iPhone y iPad comparten la misma app universal. La web usa la misma cuenta para que puedas organizar un PDF desde una computadora y revisar el plan desde tu teléfono.',
        'Y funciona en tu idioma: la app entera está en español, no solo este sitio. Puedes elegirlo en la primera pantalla de bienvenida o en Mi cuenta > Configuración > Idioma, y la elección se guarda en tu cuenta, así que se mantiene igual en el iPad y en la web.',
        'Sin conexión también avanzas: puedes crear cursos y tareas, editarlos y marcarlos como completados. Los cambios se guardan en el dispositivo y se sincronizan solos cuando vuelve la señal, y los últimos siete días de tus datos quedan en caché para que un aula sin señal no te deje con una pantalla vacía. Eliminar es lo único que espera a tener conexión.',
      ] },
    ],
    faq: [
      { question: '¿Qué funciones son gratis?', answer: 'Cinco escaneos al mes, hasta cuatro cursos por semestre, tareas, fechas de entrega, calificaciones y recordatorios el mismo día.' },
      { question: '¿Qué añade Pro?', answer: 'Cursos ilimitados, sincronización con Canvas, Blackboard y Moodle, Plan Inteligente, Tutor, tarjetas, temporizador, pronósticos, alertas y sincronización de calendario.' },
    ],
  }),
  page('/es/calculadora-gpa', '/gpa-calculator', 'gpa', {
    metaTitle: 'Calculadora de GPA gratis',
    metaDescription: 'Calcula tu GPA universitario por créditos y entiende los puntos de calidad con una herramienta gratis.',
    h1: 'Calculadora de GPA por créditos',
    lede: 'Añade tus cursos, calificaciones y créditos. La calculadora actualiza el GPA al instante y no guarda ninguna información.',
    intro: [
      'El GPA no es un promedio simple cuando los cursos tienen distintos créditos. Cada calificación se convierte en puntos, se multiplica por los créditos y luego se divide entre el total de créditos contados.',
    ],
    sections: [
      { heading: 'La fórmula', paragraphs: ['GPA = suma de (puntos de la calificación × créditos del curso) ÷ suma de créditos. Un curso sin calificación seleccionada queda fuera del cálculo en lugar de contar como cero.'] },
      { heading: 'Cómo interpretar el resultado', paragraphs: ['Comprueba la escala de tu institución: algunas universidades no asignan 4.0 a una A+ o utilizan valores distintos para las calificaciones con + o −. Esta calculadora utiliza una escala estándar de 4.0.'] },
      { heading: 'Del cálculo al seguimiento', paragraphs: ['Semora también calcula promedios ponderados dentro de cada curso a medida que registras tareas. Pro añade pronósticos para estimar qué calificación necesitas en las actividades pendientes.'] },
    ],
    faq: [
      { question: '¿La calculadora guarda mis cursos?', answer: 'No. El cálculo ocurre en tu navegador y se restablece al cerrar o actualizar la página.' },
      { question: '¿A+ vale 4.0?', answer: 'En esta herramienta sí. Consulta la escala oficial de tu institución porque algunas usan valores diferentes.' },
    ],
  }),
  page('/es/temporizador-pomodoro', '/pomodoro-timer', 'pomodoro', {
    metaTitle: 'Temporizador Pomodoro gratis para estudiantes',
    metaDescription: 'Temporizador de concentración con sesiones de 15, 25, 45 o 50 minutos y descansos ajustables.',
    h1: 'Temporizador Pomodoro para estudiar entre clases',
    lede: 'Elige una sesión que se adapte al tiempo que realmente tienes. El reloj sigue siendo preciso aunque cambies de pestaña.',
    intro: [
      'La técnica Pomodoro alterna periodos de concentración y descanso. No siempre tienes que estudiar durante 25 minutos: si solo dispones de un hueco entre clases, 15 pueden ser suficientes; una lectura larga quizá necesite 45 o 50.',
    ],
    sections: [
      { heading: 'Cómo usarlo', paragraphs: ['Elige una duración, define el descanso, empieza con una tarea concreta y evita cambiar de objetivo durante el bloque. Cuando termine, descansa de verdad antes de continuar.'] },
      { heading: 'Dale un objetivo concreto a cada bloque', paragraphs: ['“Estudiar química” es demasiado amplio. “Resolver los problemas 1–8 sin apuntes” crea un final claro y te permite medir si el bloque funcionó.'] },
      { heading: 'Conecta cada sesión con tu semestre', paragraphs: ['El temporizador de Semora Pro está integrado con tus tareas y tu Plan Inteligente, para que cada sesión de estudio corresponda a una fecha de entrega real.'] },
    ],
    faq: [
      { question: '¿Tengo que usar 25 minutos?', answer: 'No. Puedes elegir 15, 25, 45 o 50 minutos y descansos de 5, 10 o 15.' },
      { question: '¿El temporizador sigue si cambio de pestaña?', answer: 'Sí. Sí. El temporizador se basa en una hora de finalización, así que el tiempo restante sigue siendo exacto incluso cuando el navegador reduce la actividad de una pestaña en segundo plano., incluso cuando el navegador reduce la actividad de una pestaña en segundo plano.' },
    ],
  }),
  page('/es/blog', '/blog', 'blog-index', {
    metaTitle: 'Guías universitarias de Semora',
    metaDescription: 'Guías en español sobre programas, fechas, GPA, Canvas, Pomodoro y planificación de finales.',
    h1: 'Guías para un semestre más claro',
    lede: 'Explicaciones prácticas para organizar fechas, calificaciones y tiempo de estudio sin convertir la planificación en otra clase.',
    intro: ['Cada guía se puede leer por separado y también conecta con una herramienta gratuita o una función de Semora cuando necesitas pasar de la idea a la acción.'],
    sections: [],
    faq: [],
  }),
  page('/es/comparar', '/compare', 'compare-index', {
    metaTitle: 'Comparar Semora con otras apps para estudiantes',
    metaDescription: 'Compara Semora con Shovel, StudyFetch, Mindgrasp, Taskade, DormWay, Studley AI y myHomework.',
    h1: 'Compara según el problema que de verdad necesitas resolver',
    lede: 'No todas las aplicaciones para estudiantes resuelven el mismo problema. Estas comparaciones distinguen entre organización del semestre, estudio con IA y gestión general de tareas.',
    intro: ['Semora parte del programa de cada materia y conecta fechas de entrega, calificaciones y planificación. Otras herramientas dan prioridad a los resúmenes, las tarjetas, los proyectos generales o la entrada manual de datos.'],
    sections: [
      { heading: 'Cómo leer las comparaciones', paragraphs: ['Revisa primero cómo incorporas la información, después qué datos mantiene actualizados cada producto y, por último, cuánto trabajo manual queda. Una lista larga de funciones sirve de poco si todavía tienes que copiar cada fecha por tu cuenta.'] },
    ],
    faq: [],
  }),
];

const KEYWORD_PAGES: SpanishPageConfig[] = [
  page('/es/escaner-de-programa-de-estudios', '/ai-syllabus-scanner', 'standard', {
    metaTitle: 'Escáner de programas de clase con IA',
    metaDescription: 'Extrae tareas, exámenes, horarios y ponderaciones a partir de fotos, PDFs o texto, y revisa todo antes de guardar.',
    h1: 'Convierte el programa de una materia en un semestre organizado',
    lede: 'Sube el documento una vez. La IA de Semora identifica la estructura académica y te permite comprobar cada resultado.',
    intro: ['Las fechas pueden aparecer en tablas, párrafos, calendarios o notas al pie. Copiarlas a mano lleva tiempo y es fácil equivocarse. Semora convierte ese contenido en información que puedes revisar antes de guardarla.'],
    sections: [
      { heading: 'Cuatro formas de añadir el programa', paragraphs: ['Toma una foto de hasta cinco páginas, sube un PDF, arrastra un archivo en la web o pega texto desde un visor de PDF o una página del LMS.'], bullets: ['Nombre y código del curso', 'Profesor, horarios y horas de atención', 'Fechas del semestre y criterios de evaluación', 'Tareas, exámenes, proyectos, lecturas y ponderaciones'] },
      { heading: 'La revisión evita que una suposición se convierta en una fecha', paragraphs: ['Los resultados con menor confianza se marcan para revisión. Los elementos sin fecha quedan separados y desactivados hasta que los corrijas. Nada llega a tu calendario automáticamente solo porque la IA lo sugirió.'] },
      { heading: 'Después del escaneo', paragraphs: ['Las fechas se incorporan a la vista Hoy, al calendario, a los recordatorios, a la carga académica y al Plan Inteligente. Las categorías y ponderaciones preparan el seguimiento de calificaciones.'] },
    ],
    faq: [
      { question: '¿Puede leer un PDF escaneado?', answer: 'Sí. Los archivos PDF y las imágenes compatibles se procesan visualmente. Para obtener mejores resultados, procura que las páginas salgan nítidas, sin inclinación y bien iluminadas.' },
      { question: '¿Guarda algo sin preguntarme?', answer: 'No. Primero revisas y editas el resultado; luego eliges qué guardar.' },
      { question: '¿Cuántos escaneos son gratis?', answer: 'Cinco escaneos completados al mes. Pro elimina el límite mensual.' },
    ],
  }),
  page('/es/planificador-de-estudio-con-ia', '/ai-study-planner-for-college', 'standard', {
    metaTitle: 'Planificador de estudio con IA para la universidad',
    metaDescription: 'Crea un plan adaptativo desde tus fechas reales, hábitos, exámenes, calificaciones y tiempo disponible.',
    h1: 'Un plan de estudio que aprende de tu semestre',
    lede: 'Plan Inteligente distribuye trabajo antes de las fechas importantes, reajusta lo que no completaste y explica cada cambio.',
    intro: ['Una lista de tareas solo te dice qué tienes pendiente. Un plan útil también decide cuándo empezar, cuánto tiempo reservar y qué mover cuando la semana cambia.'],
    sections: [
      { heading: 'Señales que tiene en cuenta', paragraphs: ['El plan considera las fechas y la dificultad, la proximidad de los exámenes, los bloques disponibles, el tiempo real que tardas, las sesiones pendientes, los cambios del calendario y el riesgo académico.'], bullets: ['Empieza antes con los trabajos grandes', 'Reserva tiempo para los exámenes cercanos', 'Reduce o mueve sesiones cuando la semana se llena', 'Da prioridad a los cursos donde una calificación puede tener más impacto'] },
      { heading: 'Cada ajuste tiene una razón', paragraphs: ['En lugar de mover los bloques sin avisarte, Semora muestra si el cambio se debe a una fecha nueva, una sesión perdida, un examen cercano, disponibilidad diferente o riesgo académico., Semora muestra si el cambio se debe a una fecha nueva, una sesión perdida, un examen cercano, disponibilidad diferente o riesgo académico.'] },
      { heading: 'Tú sigues teniendo el control', paragraphs: ['Puedes completar, mover o ignorar un bloque. El sistema aprende de lo que realmente ocurre sin convertir una recomendación en una obligación rígida.'] },
    ],
    faq: [
      { question: '¿El plan reemplaza mi calendario?', answer: 'No. Usa tus fechas y disponibilidad para proponer bloques. Tú decides qué aceptar y puedes sincronizarlos con tu calendario.' },
      { question: '¿Qué pasa si pierdo una sesión?', answer: 'El plan intenta redistribuir el trabajo restante y muestra la razón del cambio.' },
      { question: '¿Es una función gratis?', answer: 'Plan Inteligente es parte de Semora Pro.' },
    ],
  }),
  page('/es/seguimiento-de-fechas-de-canvas', '/canvas-deadline-tracker', 'standard', {
    metaTitle: 'Seguimiento de fechas de Canvas',
    metaDescription: 'Importa tareas y calificaciones de Canvas, revisa el historial y actualiza recordatorios cuando cambian las fechas.',
    h1: 'Haz que las fechas de Canvas formen parte de tu plan completo',
    lede: 'Canvas contiene las tareas. Semora las combina con los horarios, las calificaciones, los recordatorios y la planificación de todos tus cursos.',
    intro: ['Un anuncio o cambio de fecha puede quedar enterrado dentro de un curso. Semora reúne las entregas en una sola vista y registra cuándo se sincronizaron.'],
    sections: [
      { heading: 'Conexión flexible', paragraphs: ['Los estudiantes pueden conectar Canvas con un token personal cuando su institución lo permite. Si la universidad habilita OAuth, Si una escuela aprueba OAuth, puedes autorizar la conexión directamente desde tu cuenta institucional.. La disponibilidad depende de la institución.'] },
      { heading: 'Sincronización automática con historial revisable', paragraphs: ['Al activar la sincronización automática, Semora busca cambios en segundo plano. El historial muestra la última actualización, los cursos incluidos, los elementos importados y cualquier error que requiera tu atención.'], bullets: ['Vinculación de cursos para evitar duplicados', 'Actualización de fechas y calificaciones', 'Reintentos con mensajes claros', 'Eliminación de la credencial guardada al desconectar'] },
      { heading: 'Canvas más el programa', paragraphs: ['Canvas puede no incluir las horas de atención del profesor, la escala de calificación o el calendario completo. Añadir el programa aporta ese contexto sin reemplazar los datos oficiales de Canvas.'] },
    ],
    faq: [
      { question: '¿Necesito una clave de desarrollador?', answer: 'No para el flujo con token personal del estudiante. Una clave institucional solo simplifica la conexión mediante OAuth cuando la escuela la aprueba.' },
      { question: '¿Funciona si Canvas cambia una fecha?', answer: 'La siguiente sincronización puede actualizar la tarea y reajustar los recordatorios vinculados.' },
      { question: '¿También admite Blackboard y Moodle?', answer: 'Sí. Las opciones exactas dependen de lo que permita cada institución.' },
    ],
  }),
];

type FeatureDetail = {
  why: string;
  steps: string[];
  result: string;
  faq: { question: string; answer: string }[];
};

const FEATURE_DETAILS: Record<string, FeatureDetail> = {
  'syllabus-scanner': {
    why: 'El programa contiene la estructura del curso, pero no siempre es fácil convertir ese documento en acciones concretas. Semora hace la organización inicial y la revisión final la haces tú.',
    steps: ['Añade una foto, un PDF o texto.', 'La IA identifica los datos y señala lo que conviene revisar.', 'Corrige cualquier dato dudoso.', 'Guarda solo los elementos que hayas seleccionado.'],
    result: 'Obtienes un curso con fechas, horarios, criterios de evaluación y tareas, listo para usar en el resto de Semora.',
    faq: [{ question: '¿Qué formatos admite?', answer: 'PDF, JPEG, PNG y WEBP; en la web también puedes pegar texto.' }],
  },
  'grade-tracking': {
    why: 'Una lista de calificaciones no muestra cuánto vale cada actividad Una lista de calificaciones no muestra cuánto vale cada actividad ni qué parte del curso ya se calificó. El promedio ponderado sí.. El promedio ponderado sí.',
    steps: ['Registra la puntuación y el porcentaje de cada tarea.', 'Agrupa por categorías cuando el curso las usa.', 'Compara el promedio actual con tu escala.', 'Usa Pro para probar resultados futuros.'],
    result: 'Ves cómo vas ahora y qué actividades pendientes pesan más en tu promedio.',
    faq: [{ question: '¿Cuenta las tareas sin calificación?', answer: 'No. El promedio actual refleja el trabajo ya evaluado; los pronósticos tratan las actividades pendientes por separado.' }],
  },
  'smart-plan': {
    why: 'Las fechas por sí solas no reservan tiempo. Plan Inteligente convierte la prioridad, el riesgo y la disponibilidad en bloques concretos.',
    steps: ['Semora lee tus próximas entregas y exámenes.', 'Estima bloques según tamaño y riesgo.', 'Detecta las sesiones que completaste y las que te saltaste.', 'Reajusta y explica cada cambio.'],
    result: 'Tienes una propuesta diaria que se adapta a lo que sucede, en lugar de quedarse anclada al plan del inicio del semestre.',
    faq: [{ question: '¿Puedo mover un bloque?', answer: 'Sí. El plan es una recomendación editable y usa tus cambios como nueva información.' }],
  },
  flashcards: {
    why: 'Preparar las tarjetas lleva tiempo que podrías dedicar al repaso. Semora usa el material que ya vinculaste al curso.',
    steps: ['Elige todo el curso o un examen específico.', 'Selecciona el programa y los apuntes que quieras usar.', 'Genera y revisa las tarjetas.', 'Repasa con repetición espaciada.'],
    result: 'El mazo se centra en el material del curso y puedes editar las tarjetas o añadir las tuyas a mano.',
    faq: [{ question: '¿Puedo crear tarjetas sin IA?', answer: 'Sí. Cada mazo también admite tarjetas manuales.' }],
  },
  'focus-timer': {
    why: 'Las sesiones sin un límite claro tienden a alargarse o interrumpirse. Un bloque con principio y final facilita dar el primer paso.',
    steps: ['Elige 15, 25, 45 o 50 minutos.', 'Define un objetivo concreto.', 'Trabaja sin cambiar de tarea.', 'Descansa 5, 10 o 15 minutos.'],
    result: 'Acumulas sesiones pequeñas y medibles que caben entre clases.',
    faq: [{ question: '¿Funciona en segundo plano?', answer: 'Sí. El temporizador sigue corriendo y se ajusta a la hora real cuando vuelves a la app.' }],
  },
  'ai-tutor': {
    why: 'Un chatbot genérico no sabe qué temas incluye tu curso ni cuál es tu próxima entrega. El Tutor utiliza las fuentes que has vinculado.',
    steps: ['Abre el Tutor desde un curso.', 'Haz una pregunta o elige un modo de práctica.', 'Consulta las referencias al programa, los apuntes o las tareas.', 'Sigue recomendaciones basadas en los temas que debes reforzar y en tus próximas fechas.'],
    result: 'Recibes explicaciones, cuestionarios, tarjetas y sugerencias conectados con el contexto real del curso.',
    faq: [{ question: '¿Puede inventar una fecha?', answer: 'Las preguntas sobre fechas se responden a partir de tus tareas guardadas. Si no la tiene guardada, el Tutor te lo indica en lugar de inventarla.' }],
  },
  collaboration: {
    why: 'Los grupos pierden tiempo comparando versiones distintas de la misma fecha. Un Espacio de curso mantiene una única versión compartida de cada fecha.',
    steps: ['Un usuario Pro crea el espacio.', 'Comparte el enlace de invitación.', 'Los compañeros se unen gratis.', 'Las fechas y tareas de grupo se actualizan para todos.'],
    result: 'El grupo ve el mismo calendario sin depender de capturas o mensajes antiguos.',
    faq: [{ question: '¿Necesito Pro para unirme?', answer: 'No. Crear un espacio requiere Pro, pero unirse mediante una invitación es gratis.' }],
  },
  'canvas-sync': {
    why: 'Las plataformas académicas mantienen cada curso por separado. Semora reúne todas las fechas en un solo lugar y conserva el historial de sincronización.',
    steps: ['Conecta Semora con tu plataforma académica mediante el método que permita tu institución.', 'Relaciona cada curso de tu plataforma con el curso correspondiente en Semora.', 'Elige entre sincronización manual y automática.', 'Consulta la última actualización y cualquier error.'],
    result: 'Las tareas, entregas y calificaciones seleccionadas se mantienen sincronizadas sin crear duplicados.',
    faq: [{ question: '¿Dónde se guarda el token?', answer: 'De forma predeterminada permanece en el dispositivo. Si activas la sincronización automática, el token se guarda cifrado en Supabase Vault hasta que la desactives o desconectes la plataforma.' }],
  },
};

const FEATURE_PAGES = FEATURES_ES.map((feature) => {
  const detail = FEATURE_DETAILS[feature.englishSlug];
  return page(`/es/funciones/${feature.slug}`, `/features/${feature.englishSlug}`, 'feature', {
    metaTitle: feature.name,
    metaDescription: feature.shortDescription,
    h1: feature.name,
    lede: feature.shortDescription,
    intro: [feature.description, detail.why],
    sections: [
      { heading: 'Cómo funciona', paragraphs: [], bullets: detail.steps },
      { heading: 'Qué obtienes', paragraphs: [detail.result] },
      { heading: feature.tier === 'pro' ? 'Incluido con Semora Pro' : 'Incluido en el plan Gratis', paragraphs: [feature.tier === 'pro' ? 'Crea una cuenta gratuita y prueba el escaneo de programas, los cursos y las calificaciones antes de pasarte a Pro.' : 'Puedes empezar sin tarjeta de crédito. El plan Gratis incluye cinco escaneos al mes y hasta cuatro cursos por semestre.'] },
    ],
    faq: [
      ...detail.faq,
      // "La función" keeps the subject singular. Without it a plural feature name
      // ("Espacios de curso", "Tarjetas de estudio") produced "¿Espacios de curso
      // funciona…?" on every plural feature page.
      { question: `¿La función ${feature.name} funciona en iPhone, iPad y la web?`, answer: 'Sí. La misma cuenta mantiene tus datos disponibles en las tres plataformas; algunas integraciones propias del dispositivo pueden variar.' },
    ],
  }, feature);
});

export const SPANISH_BLOG_POSTS = [
  {
    path: '/es/blog/convertir-programa-en-calendario',
    englishPath: '/blog/syllabus-to-semester-calendar',
    title: 'Cómo convertir el programa de una materia en un calendario del semestre',
    description: 'Un método paso a paso para extraer fechas, horarios y ponderaciones de un programa y convertirlos en un plan útil.',
    date: '20 de julio de 2026',
    image: '/illustrations/syllabus-calendar.svg',
    imageAlt: 'Ilustración de la página de un programa que se convierte en un calendario con una fecha de entrega marcada',
  },
  {
    path: '/es/blog/calcular-gpa-ponderado',
    englishPath: '/blog/weighted-gpa-calculator',
    title: 'Cómo calcular un GPA ponderado con ejemplos reales',
    description: 'La fórmula, los puntos de calidad y la diferencia entre créditos, ponderaciones y promedios simples.',
    date: '21 de julio de 2026',
    image: '/illustrations/grade-card.svg',
    imageAlt: 'Ilustración de una boleta de calificaciones con una nota A− y una insignia de estrella',
  },
  {
    path: '/es/blog/mejores-apps-fechas-universidad-2026',
    englishPath: '/blog/best-college-deadline-tracking-apps-2026',
    title: 'Las mejores apps para controlar las entregas universitarias en 2026',
    description: 'Qué buscar en un planificador y cómo comparar la entrada manual, la conexión con un LMS y el escaneo del programa.',
    date: '22 de julio de 2026',
    image: '/illustrations/trophy-compare.svg',
    imageAlt: 'Ilustración de un trofeo sobre un podio que representa una comparación de apps',
  },
  {
    path: '/es/blog/recordatorios-fechas-canvas',
    englishPath: '/blog/canvas-deadline-reminders',
    title: 'Cómo recibir mejores recordatorios de Canvas',
    description: 'Por qué algunas notificaciones pasan desapercibidas y cómo convertir los cambios de Canvas en recordatorios útiles.',
    date: '23 de julio de 2026',
    image: '/illustrations/bell-reminder.svg',
    imageAlt: 'Ilustración de una campana de recordatorio frente a la hoja de un calendario',
  },
  {
    path: '/es/blog/tecnica-pomodoro-entre-clases',
    englishPath: '/blog/pomodoro-technique-between-classes',
    title: 'La técnica Pomodoro entre clases',
    description: 'Cómo adaptar tus sesiones de concentración a los huecos reales de un horario universitario.',
    date: '24 de julio de 2026',
    image: '/illustrations/tomato-timer.svg',
    imageAlt: 'Ilustración de un temporizador de cocina con forma de tomate, el origen de la técnica Pomodoro',
  },
  {
    path: '/es/blog/plan-de-estudio-para-finales',
    englishPath: '/blog/finals-week-study-plan',
    title: 'Cómo crear un plan de estudio para finales',
    description: 'Prioriza según la fecha, el peso de cada evaluación, tu dominio del tema y el tiempo disponible, sin sobrecargar los últimos días.',
    date: '25 de julio de 2026',
    image: '/illustrations/book-stack.svg',
    imageAlt: 'Ilustración de una pila de libros de texto con un birrete encima',
  },
] as const;

const BLOG_PAGES: SpanishPageConfig[] = [
  page(SPANISH_BLOG_POSTS[0].path, SPANISH_BLOG_POSTS[0].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[0].title,
    metaDescription: SPANISH_BLOG_POSTS[0].description,
    h1: SPANISH_BLOG_POSTS[0].title,
    lede: 'El objetivo no es copiar cada palabra. Es separar la información que cambia tus decisiones durante el semestre.',
    intro: [
      'Un programa mezcla políticas, lecturas, fechas, horarios y criterios de evaluación. Antes de abrir el calendario, define qué datos necesitas y cuál es la fuente oficial cuando dos fechas no coinciden.',
    ],
    sections: [
      {
        heading: '1. Consigue una versión legible',
        paragraphs: ['Descarga el PDF original si está disponible. Si solo tienes una copia en papel, Descarga el PDF original si está disponible. Si solo tienes una copia en papel, toma fotos bien encuadradas, enfocadas y con buena luz. Si el documento está en la plataforma del curso, copia el texto o guárdalo como PDF.. Si el documento está en la plataforma del curso, copia el texto o guárdalo como PDF.'],
      },
      {
        heading: '2. Extrae primero la estructura del curso',
        paragraphs: ['Anota nombre, profesor, horarios, ubicación, fechas del semestre y escala de calificaciones. Esos datos sirven para interpretar las tareas que aparecen después.'],
      },
      {
        heading: '3. Convierte cada entrega en una entrada concreta',
        paragraphs: ['Cada elemento debe tener título, curso, tipo, fecha, hora y ponderación cuando se conozcan. No confundas “sin fecha” con “sin importancia”: un examen final sin fecha sigue necesitando seguimiento.'],
        bullets: ['Tareas y guías de ejercicios', 'Exámenes y pruebas', 'Proyectos y presentaciones', 'Lecturas con entrega o discusión', 'Laboratorios e informes'],
      },
      {
        heading: '4. Revisa antes de activar recordatorios',
        paragraphs: ['Busca años incorrectos, fechas reutilizadas de otro semestre, errores de zona horaria y tablas que separan la fecha del nombre. Solo después configura recordatorios y bloques de estudio.'],
      },
      {
        heading: '5. Mantén el calendario al día',
        paragraphs: ['El programa es el punto de partida. Los anuncios y el LMS pueden cambiar fechas. Registra la última actualización y conserva la fuente del cambio para no terminar con dos versiones de la misma tarea.'],
      },
      {
        heading: 'Cómo lo automatiza Semora',
        paragraphs: ['Semora identifica la estructura, te muestra el resultado para que lo revises y solo crea el curso cuando das tu aprobación. Después, las conexiones con el LMS pueden actualizar las tareas y el historial muestra qué cambió.'],
      },
    ],
    faq: [
      { question: '¿Debo poner las lecturas en el calendario?', answer: 'Sí cuando tienen una fecha de discusión, prueba o entrega. Las lecturas abiertas funcionan mejor como tareas sin hora exacta.' },
      { question: '¿Qué hago con una fecha “por anunciar”?', answer: 'Conserva el elemento sin inventar una fecha y revísalo cuando el profesor publique la actualización.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[1].path, SPANISH_BLOG_POSTS[1].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[1].title,
    metaDescription: SPANISH_BLOG_POSTS[1].description,
    h1: SPANISH_BLOG_POSTS[1].title,
    lede: 'Un promedio ponderado te dice cuánto pesa cada curso; un promedio simple trata todo como si tuviera el mismo peso.',
    intro: ['Para calcular el GPA necesitas la calificación en letras, los puntos que asigna tu institución y los créditos de cada curso. Las ponderaciones dentro de una materia son un cálculo diferente.'],
    sections: [
      { heading: 'La fórmula del GPA', paragraphs: ['Multiplica los puntos de cada letra por los créditos del curso. Suma esos puntos de calidad y divídelos entre los créditos totales: GPA = Σ(puntos × créditos) ÷ Σ(créditos).'] },
      { heading: 'Ejemplo de tres cursos', paragraphs: ['Una A en un curso de 3 créditos aporta 12 puntos de calidad. Una B+ en otro curso de 3 créditos aporta 9.9. Una A− en un curso de 4 créditos aporta 14.8. El total es 36.7 ÷ 10 = 3.67.'] },
      { heading: 'Errores comunes', paragraphs: ['No promedies las letras directamente, no cuentes un curso sin calificación como cero y no des por hecho que todas las instituciones usan la misma escala. Comprueba también cómo tratan los cursos repetidos, las materias con aprobado/no aprobado (pass/fail) y los créditos transferidos.'] },
      { heading: 'GPA y calificación dentro del curso', paragraphs: ['El GPA combina cursos según sus créditos. La calificación de un curso suele combinar tareas por ponderación o categoría. Semora mantiene ambos cálculos separados para que una tarea del 5 % no tenga el mismo impacto que un examen del 30 %.'] },
    ],
    faq: [
      { question: '¿Una A+ siempre vale más de 4.0?', answer: 'No. Muchas instituciones la tratan como 4.0 y otras usan otra escala. Consulta la política oficial.' },
      { question: '¿Los créditos cambian el GPA?', answer: 'Sí. Un curso de cuatro créditos influye más que uno de un crédito.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[2].path, SPANISH_BLOG_POSTS[2].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[2].title,
    metaDescription: SPANISH_BLOG_POSTS[2].description,
    h1: SPANISH_BLOG_POSTS[2].title,
    lede: 'La mejor app es la que exige menos mantenimiento y te ayuda a actuar antes de que una entrega se vuelva urgente.',
    intro: ['Compara cómo incorpora tus datos cada herramienta, cómo gestiona los cambios y qué decisiones te ayuda a tomar. Una app puede verse muy bien y aun así servir de poco si tienes que copiar todo a mano cada semana.'],
    sections: [
      { heading: 'Planificadores de entrada manual', paragraphs: ['Son flexibles y fáciles de entender. Funcionan bien si llevas pocas materias, pero dependen de que recuerdes cada anuncio, cambio y ponderación. Busca opciones de importación, recordatorios y edición rápida.'] },
      { heading: 'Herramientas conectadas al LMS', paragraphs: ['Reducen la entrada manual cuando tu institución permite el acceso. Comprueba si importan solo tareas o también calificaciones y cambios, si muestran la última sincronización y qué ocurre cuando una actualización falla.'] },
      { heading: 'Herramientas que escanean el programa de la materia', paragraphs: ['Resultan especialmente útiles al principio del semestre, porque el programa puede incluir fechas que todavía no aparecen en el LMS. La revisión es indispensable: una IA debe señalar las dudas en lugar de guardar suposiciones como si fueran datos confirmados.'] },
      { heading: 'Planificación y estudio', paragraphs: ['El calendario, el GPA, las tarjetas, el temporizador y el Tutor aportan más valor cuando comparten el mismo contexto. Si cada función te obliga a subir el material de nuevo, el sistema genera más trabajo.'] },
      { heading: 'Lista de evaluación', paragraphs: [], bullets: ['¿Funciona en tus dispositivos?', '¿Mantiene una sola cuenta sincronizada?', '¿Puedes exportar o eliminar tus datos?', '¿Explica los límites de los planes Gratis y Pro antes de registrarte?', '¿Las fechas importantes conservan su fuente?'] },
    ],
    faq: [
      { question: '¿Debo elegir una app conectada a Canvas?', answer: 'Solo si tu institución permite una conexión estable. Una buena herramienta para escanear el programa o añadir datos manualmente sigue siendo importante para la información que Canvas no incluye.' },
      { question: '¿Tener más funciones significa que una app es mejor?', answer: 'No necesariamente. Da prioridad al flujo que usarás cada semana y a cuánto trabajo manual te exige.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[3].path, SPANISH_BLOG_POSTS[3].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[3].title,
    metaDescription: SPANISH_BLOG_POSTS[3].description,
    h1: SPANISH_BLOG_POSTS[3].title,
    lede: 'Las notificaciones del LMS te cuentan qué ocurrió. Un buen sistema de recordatorios te avisa con tiempo para que puedas actuar.',
    intro: ['Canvas puede enviar anuncios, comentarios, mensajes y cambios de calificación. Cuando todo tiene la misma urgencia, una fecha importante se pierde entre alertas que no requieren acción.'],
    sections: [
      { heading: 'Distingue entre notificaciones y recordatorios', paragraphs: ['Una notificación te informa de algo que ya ocurrió. Un recordatorio te avisa con tiempo sobre lo que debes hacer. Mantén las alertas inmediatas para los cambios importantes y programa recordatorios anticipados para las entregas.'] },
      { heading: 'Reúne todos los cursos', paragraphs: ['Revisar cada curso por separado te obliga a comparar todo mentalmente. Una lista general puede mostrar la próxima entrega, el trabajo atrasado y las semanas con varios exámenes.'] },
      { heading: 'Actualiza cuando cambia la fuente', paragraphs: ['Si Canvas cambia una fecha, el recordatorio debe actualizarse con ella. El historial de sincronización debe indicar cuándo se revisó la plataforma y si alguna actualización falló.'] },
      { heading: 'Añade el contexto del programa', paragraphs: ['El programa suele incluir ponderaciones, horarios y políticas que Canvas omite. Combinar ambas fuentes permite distinguir una tarea pequeña de un examen que puede cambiar la calificación final.'] },
    ],
    faq: [
      { question: '¿Semora reemplaza las notificaciones de Canvas?', answer: 'No. Añade una capa personal de organización y recordatorios; Canvas sigue siendo la fuente oficial de tu curso.' },
      { question: '¿Con cuánta anticipación puede avisarme?', answer: 'El plan Gratis incluye recordatorios el mismo día. Pro permite recibir avisos con uno o tres días de anticipación.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[4].path, SPANISH_BLOG_POSTS[4].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[4].title,
    metaDescription: SPANISH_BLOG_POSTS[4].description,
    h1: SPANISH_BLOG_POSTS[4].title,
    lede: 'No necesitas una tarde libre para progresar. Necesitas un bloque que termine antes de tu próxima obligación.',
    intro: ['El Pomodoro clásico usa 25 minutos de trabajo y 5 de descanso. En la universidad, la duración debe adaptarse al hueco que tengas entre clases y al tipo de tarea.'],
    sections: [
      { heading: 'Bloques de 15 minutos', paragraphs: ['Úsalos para organizar apuntes, responder preguntas cortas, revisar tarjetas o preparar lo necesario para una sesión más larga. El objetivo debe ser pequeño y específico.'] },
      { heading: 'Bloques de 25 minutos', paragraphs: ['Funcionan bien para la lectura activa, una serie de ejercicios o un borrador. Deja dos minutos al final para anotar el siguiente paso.'] },
      { heading: 'Bloques de 45 o 50 minutos', paragraphs: ['Reserva estas sesiones para práctica profunda, ensayos o problemas que necesitan contexto continuo. Después toma un descanso real de 10 o 15 minutos.'] },
      { heading: 'Evita medir solo tiempo', paragraphs: ['Cuenta también qué terminaste y qué aprendiste. Si después de tres bloques sigues sin avanzar con el mismo tipo de problema, cambia de estrategia o pide ayuda en lugar de acumular minutos.'] },
    ],
    faq: [
      { question: '¿Puedo usar el teléfono durante el descanso?', answer: 'Puedes, pero levantarte, beber agua o mirar a lo lejos suele ayudarte más a recuperar la concentración.' },
      { question: '¿Qué hago si me interrumpen?', answer: 'Pausa el temporizador si la interrupción es breve. Si pierdes por completo el hilo, vuelve con un objetivo más pequeño y concreto.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[5].path, SPANISH_BLOG_POSTS[5].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[5].title,
    metaDescription: SPANISH_BLOG_POSTS[5].description,
    h1: SPANISH_BLOG_POSTS[5].title,
    lede: 'La semana de finales no se organiza repartiendo las horas por igual. Hay que tener en cuenta la fecha, el peso de cada evaluación, tu dominio del tema y el tiempo disponible.',
    intro: ['Empieza con una lista de todos los exámenes y entregas, con su hora, ponderación, formato y contenido. Después estima cuánto dominas cada tema.'],
    sections: [
      { heading: '1. Calcula la presión de cada evaluación', paragraphs: ['Una evaluación cercana, con mucho peso y sobre un tema que dominas poco necesita atención antes que otra lejana, pequeña y sobre un tema que ya controlas. Usa esos cuatro criterios —fecha, peso, dominio del tema y tiempo disponible— para establecer prioridades, no solo la fecha.'] },
      { heading: '2. Divide el material en resultados observables', paragraphs: ['Cambia “estudiar biología” por “explicar la respiración celular sin apuntes” o “resolver diez preguntas mixtas y revisar errores”. Cada bloque debe terminar con evidencia.'] },
      { heading: '3. Combina práctica y recuperación activa', paragraphs: ['Alterna la recuperación activa, la resolución de problemas, las explicaciones y los simulacros. Deja espacio entre repasos del mismo tema para que el siguiente intento mida lo que recuerdas, no solo lo familiar que te resulta el contenido.'] },
      { heading: '4. Protege el sueño, las comidas y los traslados', paragraphs: ['Un plan que usa cada minuto disponible se rompe con el primer retraso. Conserva márgenes y fija una hora tope para dejar de estudiar la noche anterior al examen.'] },
      { heading: '5. Revisa el plan cada día', paragraphs: ['Marca lo terminado, dedica menos tiempo a lo que ya dominas y reprograma lo que no pudiste completar. Si el tiempo no alcanza, elimina de forma consciente las tareas de menor impacto en lugar de fingir que todo cabe.'] },
    ],
    faq: [
      { question: '¿Cuándo debo empezar?', answer: 'En cuanto tengas el calendario de finales. Incluso diez minutos para anotar las evaluaciones y el material te ahorran decisiones más adelante.' },
      { question: '¿Cómo priorizo dos exámenes el mismo día?', answer: 'Compara peso, nivel actual, cantidad de material y oportunidades futuras. Alterna bloques para evitar abandonar por completo uno de los cursos.' },
    ],
  }),
];

export const SPANISH_COMPARISONS = [
  { slug: 'dormway', name: 'DormWay', focus: 'una experiencia académica y de campus más amplia' },
  { slug: 'shovel', name: 'Shovel', focus: 'la planificación de estudio por tiempo y la integración con el LMS' },
  { slug: 'studyfetch', name: 'StudyFetch', focus: 'la generación de materiales de estudio con IA' },
  { slug: 'mindgrasp', name: 'Mindgrasp', focus: 'los resúmenes, los apuntes y las preguntas a partir de documentos y videos' },
  { slug: 'taskade', name: 'Taskade', focus: 'la gestión general de proyectos y los agentes de IA' },
  { slug: 'studley-ai', name: 'Studley AI', focus: 'las tarjetas, los cuestionarios y el contenido de estudio generado' },
  { slug: 'myhomework', name: 'myHomework Student Planner', focus: 'la planificación manual multiplataforma y la importación desde el LMS' },
] as const;

function comparisonPage(item: (typeof SPANISH_COMPARISONS)[number]): SpanishPageConfig {
  return page(`/es/comparar/${item.slug}`, `/compare/${item.slug}`, 'standard', {
    metaTitle: `Semora vs ${item.name}`,
    metaDescription: `Compara Semora y ${item.name}: programas, fechas, calificaciones, estudio con IA, plataformas y trabajo manual.`,
    h1: `Semora vs ${item.name}`,
    lede: `La diferencia principal es el punto de partida: Semora organiza el semestre desde el programa; ${item.name} se concentra en ${item.focus}.`,
    intro: [
      'La mejor opción depende del problema que quieras resolver. Compara cómo entra la información, qué datos se mantienen actualizados y qué puedes hacer con ellos después.',
    ],
    sections: [
      {
        heading: 'Qué hace Semora',
        paragraphs: [
          'Semora convierte una foto, un PDF o el texto del programa en cursos, tareas, exámenes, horarios y calificaciones que puedes revisar. También puede importar datos desde Canvas, Blackboard o Moodle. Esa información se utiliza en los recordatorios, los pronósticos, el Plan Inteligente, las tarjetas y el Tutor con IA.',
        ],
      },
      {
        heading: `Dónde encaja ${item.name}`,
        paragraphs: [
          `${item.name} prioriza ${item.focus}. Puede ser una mejor opción si esa es tu necesidad principal y no buscas que el programa del curso conecte tus fechas, calificaciones y planificación.`,
        ],
      },
      {
        heading: 'Preguntas que debes hacer antes de elegir',
        paragraphs: [],
        bullets: [
          '¿Tengo que copiar las fechas a mano o la app puede leer el programa?',
          '¿Refleja los cambios del LMS y muestra cuándo se sincronizó por última vez?',
          '¿Las calificaciones se utilizan para crear pronósticos y recomendaciones?',
          '¿Funciona con la misma cuenta en iPhone, iPad y la web?',
          '¿Puedo revisar, exportar y eliminar mis datos?',
        ],
      },
      {
        heading: 'Cuándo elegir cada uno',
        paragraphs: [
          `Elige Semora si quieres una visión integrada del semestre y partir de los programas y las fechas reales de tus cursos. Considera ${item.name} si lo que más te importa es ${item.focus} y sus herramientas encajan mejor con tu forma de estudiar.`,
        ],
      },
    ],
    faq: [
      { question: `¿Semora reemplaza completamente a ${item.name}?`, answer: 'No necesariamente. Las herramientas pueden resolver problemas distintos. La comparación ayuda a decidir cuál debe ser tu sistema principal.' },
      { question: '¿Puedo probar Semora gratis?', answer: 'Sí. El plan Gratis no requiere tarjeta e incluye cinco escaneos al mes, hasta cuatro cursos por semestre, fechas de entrega y calificaciones.' },
    ],
  });
}

const COMPARISON_PAGES = SPANISH_COMPARISONS.map(comparisonPage);

const ALTERNATIVES = [
  { slug: 'alternativa-a-dormway', english: '/dormway-alternative', name: 'DormWay', need: 'organización del semestre desde el programa y seguimiento de calificaciones' },
  { slug: 'alternativa-a-shovel', english: '/shovel-alternative', name: 'Shovel', need: 'escanear programas de clase, revisar cada resultado y usar una sola cuenta en iOS y la web' },
  { slug: 'alternativa-a-studyfetch', english: '/studyfetch-alternative', name: 'StudyFetch', need: 'fechas, calificaciones y planificación además de herramientas de estudio con IA' },
  { slug: 'alternativa-a-mindgrasp', english: '/mindgrasp-alternative', name: 'Mindgrasp', need: 'convertir el programa en calendario y seguimiento académico, no solo resumir material' },
  { slug: 'alternativa-a-myhomework', english: '/myhomework-alternative', name: 'myHomework', need: 'reducir la entrada manual mediante el escaneo del programa y una planificación adaptativa' },
] as const;

const ALTERNATIVE_PAGES = ALTERNATIVES.map((item) => page(`/es/${item.slug}`, item.english, 'standard', {
  metaTitle: `Alternativa a ${item.name} para estudiantes`,
  metaDescription: `Conoce Semora como alternativa a ${item.name} para programas, fechas, calificaciones y planificación universitaria.`,
  h1: `¿Buscas una alternativa a ${item.name}?`,
  lede: `Semora puede ser una buena opción si necesitas ${item.need}.`,
  intro: [
    `Cambiar de herramienta vale la pena cuando elimina trabajo repetitivo. Antes de mover tus cursos, identifica qué información de ${item.name} tienes que actualizar a mano y qué datos necesitas conservar.`,
  ],
  sections: [
    { heading: 'Por qué considerar Semora', paragraphs: ['Semora empieza con una foto, un PDF o el texto del programa de la materia. Una vez que revisas el resultado, crea las tareas, los exámenes, los horarios y la estructura de calificaciones. Las conexiones con el LMS pueden mantener esa información al día.'] },
    { heading: 'Qué puedes probar sin pagar', paragraphs: ['Crea una cuenta sin tarjeta y Crea una cuenta sin tarjeta y obtén cinco escaneos al mes, hasta cuatro cursos por semestre, seguimiento de entregas, promedios ponderados y recordatorios el mismo día., hasta cuatro cursos por semestre, seguimiento de entregas, promedios ponderados y recordatorios el mismo día.'] },
    { heading: 'Qué añade Pro', paragraphs: ['Pro elimina límites de cursos y semestres y añade Plan Inteligente, Canvas/Blackboard/Moodle, tarjetas, Tutor con IA, temporizador, pronósticos, alertas y sincronización de calendario.'] },
    { heading: 'Cómo hacer la transición', paragraphs: ['Empieza con un solo curso. Añade el programa, revisa las fechas y compara el resultado con tu sistema actual durante una semana. No dejes de usar tu herramienta anterior hasta confirmar que toda la información importante es correcta.'] },
  ],
  faq: [
    { question: `¿Puedo usar Semora junto con ${item.name}?`, answer: 'Sí. Puedes probar un curso sin abandonar inmediatamente tu herramienta actual.' },
    { question: '¿Semora importa mis datos desde cualquier app?', answer: 'No existe una importación universal. Semora admite programas, entrada manual y conexiones con algunas plataformas: Canvas, Blackboard y Moodle.' },
  ],
}));

export const SPANISH_PAGES: SpanishPageConfig[] = [
  ...CORE_PAGES,
  ...INDEX_AND_TOOL_PAGES,
  ...KEYWORD_PAGES,
  ...FEATURE_PAGES,
  ...BLOG_PAGES,
  ...COMPARISON_PAGES,
  ...ALTERNATIVE_PAGES,
];

export function getSpanishPage(path: string): SpanishPageConfig | undefined {
  const normalized = path.replace(/\/+$/, '') || '/';
  return SPANISH_PAGES.find((item) => item.path === normalized);
}
