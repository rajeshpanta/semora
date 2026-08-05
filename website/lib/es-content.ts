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
    metaDescription: 'Por qué Semora organiza programas, fechas, calificaciones y tiempo de estudio para estudiantes universitarios.',
    h1: 'Menos administración. Más tiempo para aprender.',
    lede: 'Semora nació para convertir el documento más importante del primer día —tu programa de estudios— en un semestre que puedes entender y controlar.',
    intro: [
      'Los estudiantes reciben fechas en PDFs, plataformas académicas, correos y anuncios. El problema no es falta de esfuerzo: es que la información vive en demasiados lugares.',
      'Semora reúne esa información en una sola cuenta disponible en iPhone, iPad y web. Tú revisas los datos antes de guardarlos y sigues teniendo el control de cada cambio.',
    ],
    sections: [
      {
        heading: 'Construido alrededor de cursos reales',
        paragraphs: [
          'Semora no empieza con una lista vacía. Empieza con tu programa, tus tareas, tus horarios y tus calificaciones. Esa base permite que el calendario, los recordatorios, el Plan Inteligente y el Tutor con IA entiendan el contexto académico correcto.',
          'Canvas, Blackboard y Moodle pueden complementar el programa. Si una institución no permite una conexión sencilla, el escáner sigue funcionando con una foto, PDF o texto pegado.',
        ],
      },
      {
        heading: 'Claridad antes que ruido',
        paragraphs: [
          'Cada función debe responder una pregunta concreta: ¿qué vence después?, ¿cómo va mi nota?, ¿qué debo estudiar hoy?, ¿por qué cambió mi plan? Evitamos convertir la universidad en otro panel complicado que mantener.',
        ],
        bullets: [
          'Nada extraído por IA se guarda sin revisión.',
          'Las fechas reales del curso tienen prioridad sobre suposiciones.',
          'La misma cuenta mantiene iPhone, iPad y web sincronizados.',
        ],
      },
      {
        heading: 'Privacidad diseñada desde el principio',
        paragraphs: [
          'Los archivos académicos se guardan de forma privada y los datos personales están protegidos por reglas que limitan cada cuenta a sus propias filas. Los servicios externos solo reciben la información necesaria para la función que eliges usar.',
        ],
      },
    ],
    faq: [
      { question: '¿Semora es una escuela o plataforma LMS?', answer: 'No. Semora es una herramienta personal para organizar la información de tus cursos. Complementa Canvas, Blackboard o Moodle; no reemplaza la fuente oficial de tu institución.' },
      { question: '¿Quién puede usar Semora?', answer: 'Está pensado principalmente para estudiantes universitarios y de college que manejan varios cursos, fechas y sistemas de calificación.' },
      { question: '¿Dónde puedo usarlo?', answer: 'En iPhone, iPad y en la web con la misma cuenta.' },
    ],
  }),
  page('/es/precios', '/pricing', 'pricing', {
    metaTitle: 'Precios de Semora',
    metaDescription: 'Empieza gratis. Semora Pro cuesta $3.99 al mes o $19.99 al año e incluye planificación, IA, LMS y herramientas avanzadas.',
    h1: 'Precios simples para un semestre real',
    lede: 'Empieza con lo esencial gratis. Mejora a Pro cuando necesites cursos ilimitados, planificación adaptativa y herramientas de estudio avanzadas.',
    intro: [
      'El plan Gratis incluye cinco escaneos por mes calendario, hasta cuatro cursos en un semestre, fechas, tareas, calificaciones ponderadas y recordatorios el mismo día. No necesitas tarjeta de crédito.',
      'Pro cuesta $3.99 al mes o $19.99 al año. La compra se realiza en la app mediante tu Apple ID y se aplica a la misma cuenta en iPhone, iPad y web.',
    ],
    sections: [
      {
        heading: 'Cuándo vale la pena Pro',
        paragraphs: ['Pro está pensado para estudiantes que quieren mantener varios semestres, sincronizar plataformas académicas o convertir sus datos en un plan de estudio que se reajusta automáticamente.'],
        bullets: [
          'Cursos, semestres y escaneos ilimitados.',
          'Canvas, Blackboard y Moodle con historial de sincronización.',
          'Plan Inteligente, tarjetas, Tutor con IA y temporizador de enfoque.',
          'Pronósticos de calificaciones, alertas de riesgo y calendario externo.',
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
      { question: '¿Semora tiene un plan gratis?', answer: 'Sí. Incluye cinco escaneos mensuales, cuatro cursos en un semestre, seguimiento de fechas y calificaciones, y recordatorios el mismo día.' },
      { question: '¿Cómo compro Pro?', answer: 'Dentro de la app en iPhone o iPad mediante App Store. La suscripción se activa en toda tu cuenta, incluida la web.' },
      { question: '¿Puedo cancelar cuando quiera?', answer: 'Sí. Administra o cancela la suscripción desde la configuración de tu Apple ID.' },
      { question: '¿Pierdo mis datos si cancelo?', answer: 'No. Conservas tu cuenta y los datos compatibles con el plan Gratis; solamente se desactivan las funciones exclusivas de Pro.' },
    ],
  }),
  page('/es/ayuda', '/support', 'support', {
    metaTitle: 'Ayuda de Semora',
    metaDescription: 'Respuestas en español sobre escaneos, cuentas, suscripciones, calificaciones y sincronización, además de contacto directo.',
    h1: '¿Cómo podemos ayudarte?',
    lede: 'Cuéntanos qué sucede o revisa las respuestas más comunes. Los mensajes llegan a semora365@gmail.com.',
    intro: [
      'Incluye el dispositivo que usas, la pantalla donde ocurrió el problema y lo que esperabas que pasara. No envíes contraseñas, tokens de Canvas ni información financiera.',
    ],
    sections: [
      {
        heading: 'Soluciones rápidas',
        paragraphs: ['Antes de escribirnos, confirma que tienes conexión, que iniciaste sesión con la misma cuenta en todos tus dispositivos y que la app está actualizada.'],
        bullets: [
          'Revisa cada dato extraído antes de guardar el programa.',
          'Usa Historial de sincronización para ver errores de Canvas, Blackboard o Moodle.',
          'Las suscripciones se administran desde tu Apple ID.',
        ],
      },
    ],
    faq: [
      { question: '¿Cómo escaneo un programa?', answer: 'Abre Escanear y toma una foto, sube un PDF o elige un archivo. En la web también puedes arrastrar el archivo o pegar texto. Revisa el resultado antes de guardarlo.' },
      { question: '¿Puedo editar una tarea después?', answer: 'Sí. Abre la tarea y elige Editar para cambiar título, fecha, hora, tipo o descripción.' },
      { question: '¿Cómo se calcula mi nota?', answer: 'Semora usa las puntuaciones y porcentajes que registras. El promedio actual considera únicamente el trabajo que ya tiene calificación.' },
      { question: '¿Cómo cancelo Pro?', answer: 'En tu dispositivo abre Configuración > Apple ID > Suscripciones y selecciona Semora.' },
      { question: '¿Cómo elimino mi cuenta?', answer: 'En la app abre la pestaña Tú, baja hasta Eliminar cuenta y confirma. La eliminación es permanente.' },
    ],
  }),
  page('/es/privacidad', '/privacy', 'standard', {
    metaTitle: 'Política de privacidad',
    metaDescription: 'Cómo Semora recopila, usa, protege y elimina tu información académica y personal.',
    h1: 'Política de privacidad',
    lede: 'Última actualización: 4 de agosto de 2026. Esta traducción explica la misma política que la versión en inglés.',
    intro: [
      'Semora se compromete a proteger tu privacidad. Esta política describe la información que recopilamos, por qué la usamos, dónde se procesa y las opciones que tienes cuando utilizas nuestras aplicaciones y sitios web.',
    ],
    sections: [
      {
        heading: 'Información que recopilamos',
        paragraphs: ['Recopilamos solamente la información necesaria para ofrecer las funciones que eliges usar.'],
        bullets: [
          'Información de cuenta, como correo electrónico y credenciales protegidas.',
          'Datos académicos: semestres, cursos, tareas, notas, calificaciones y contenido del programa.',
          'Cursos y tareas de Canvas, Blackboard, Moodle o Google Classroom cuando decides conectarlos.',
          'Zona horaria, tipo de dispositivo y versión del sistema para el funcionamiento de la app.',
          'Archivos de programas y notas que decides subir para escaneo, tarjetas o Tutor con IA.',
          'Eventos de uso anónimos asociados a un identificador aleatorio de instalación, no a tu nombre o correo.',
          'Token de notificaciones si autorizas recordatorios push y datos de referidos si usas una invitación.',
        ],
      },
      {
        heading: 'Cómo usamos la información',
        paragraphs: ['Usamos tus datos para administrar tareas, calificaciones y calendarios; extraer información de programas; enviar recordatorios; sincronizar los cursos que elijas; ofrecer tarjetas, planificación y Tutor con IA; y aplicar recompensas por invitaciones.'],
      },
      {
        heading: 'Almacenamiento y seguridad',
        paragraphs: [
          'Los datos se almacenan en Supabase, alojado en AWS. Los tokens de autenticación usan el almacenamiento seguro del dispositivo. La base de datos aplica seguridad por fila para limitar cada cuenta a sus propios datos y los archivos se guardan en espacios privados.',
        ],
      },
      {
        heading: 'Servicios externos',
        paragraphs: [
          'Supabase proporciona base de datos y autenticación. OpenAI GPT-5.6 Luna procesa programas, genera tarjetas y alimenta el Tutor. OpenAI indica que los datos de API no se usan para entrenamiento salvo participación explícita; Semora desactiva el almacenamiento de respuestas, aunque OpenAI puede conservar registros de control de abuso hasta 30 días si no existe un control más estricto.',
          'Apple StoreKit procesa suscripciones. Expo entrega notificaciones autorizadas. Google Calendar solo recibe las fechas que eliges sincronizar; Semora no lee tus otros eventos.',
          'Las credenciales de Canvas, Blackboard, Moodle o Google Classroom permanecen en el dispositivo de forma predeterminada. Si activas Sincronización automática, la credencial se guarda cifrada en Supabase Vault para actualizar cursos, tareas, entregas y calificaciones mientras la app está cerrada. Se elimina al desactivar la función o desconectar la plataforma.',
        ],
      },
      {
        heading: 'Retención, eliminación y tus derechos',
        paragraphs: [
          'Conservamos tus datos mientras la cuenta esté activa. Puedes acceder a ellos desde la app, solicitar una exportación o eliminar permanentemente la cuenta y sus archivos desde Tú > Eliminar cuenta.',
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
      'Al descargar, instalar o usar Semora aceptas estos Términos de servicio. Si no estás de acuerdo, no utilices la aplicación.',
    ],
    sections: [
      { heading: '1. Descripción del servicio', paragraphs: ['Semora ayuda a estudiantes a administrar tareas, fechas y calificaciones mediante escaneo de programas con IA, seguimiento académico, herramientas de estudio y sincronización de calendarios y plataformas educativas.'] },
      { heading: '2. Registro y seguridad de la cuenta', paragraphs: ['Debes crear una cuenta y eres responsable de proteger sus credenciales y de la actividad realizada bajo ella.'] },
      { heading: '3. Suscripciones y pagos', paragraphs: ['Semora ofrece niveles Gratis y Pro. Apple App Store procesa las compras. Las suscripciones se renuevan automáticamente salvo cancelación al menos 24 horas antes del final del periodo. Puedes administrarlas en tu Apple ID y Apple gestiona los reembolsos según sus políticas. Una prueba gratuita, si se ofrece, pasa a ser de pago si no la cancelas antes de terminar.'] },
      { heading: '4. Límites del plan Gratis', paragraphs: ['El plan Gratis limita escaneos, cursos y semestres. Pro añade uso ampliado, personalización, sincronización, planificación y herramientas con IA. La app muestra los límites y precios vigentes antes de una compra.'] },
      {
        heading: '5. Uso aceptable',
        paragraphs: ['Aceptas no usar Semora con fines ilegales ni interferir con su funcionamiento.'],
        bullets: [
          'No intentes acceder a sistemas o datos de otras personas sin autorización.',
          'No subas contenido que infrinja derechos de propiedad intelectual.',
          'No intentes descompilar, abusar o eludir límites y controles del servicio.',
        ],
      },
      { heading: '6. Funciones con inteligencia artificial', paragraphs: ['La IA puede cometer errores. Debes revisar fechas, notas y demás resultados antes de depender de ellos. Semora no es responsable por fechas perdidas o información incorrecta causada por resultados que no verificaste.'] },
      { heading: '7. Propiedad intelectual', paragraphs: ['Semora conserva la propiedad de la aplicación, su contenido original y sus funciones. Tus datos académicos siguen siendo tuyos.'] },
      { heading: '8. Terminación', paragraphs: ['Puedes eliminar tu cuenta en cualquier momento. Podemos suspender o terminar una cuenta que incumpla estos términos.'] },
      { heading: '9. Garantías y responsabilidad', paragraphs: ['El servicio se ofrece “tal cual”, sin garantía de funcionamiento ininterrumpido o libre de errores. En la medida permitida por la ley, Semora no responde por daños indirectos, incidentales o consecuentes, incluidos fechas perdidas, cálculos incorrectos o pérdida de datos.'] },
      { heading: '10. Cambios y contacto', paragraphs: ['Podemos modificar estos términos. Continuar usando Semora después de un cambio constituye aceptación. Para preguntas escribe a semora365@gmail.com.'] },
    ],
    faq: [],
  }),
];

const INDEX_AND_TOOL_PAGES: SpanishPageConfig[] = [
  page('/es/funciones', '/features', 'features-index', {
    metaTitle: 'Funciones de Semora',
    metaDescription: 'Escáner con IA, calificaciones, Plan Inteligente, tarjetas, Tutor, Canvas y más para organizar la universidad.',
    h1: 'Todo lo que necesitas para organizar el semestre',
    lede: 'Desde la primera foto del programa hasta la semana de finales: una sola cuenta para fechas, notas y tiempo de estudio.',
    intro: [
      'Empieza gratis con escaneos, cuatro cursos, tareas, calificaciones y recordatorios. Pro añade automatización, cursos ilimitados y herramientas de estudio basadas en tus datos reales.',
    ],
    sections: [
      { heading: 'Un sistema conectado, no ocho herramientas separadas', paragraphs: ['El escáner crea la estructura del curso. Las fechas alimentan el calendario y el Plan Inteligente; las calificaciones alimentan los pronósticos y las recomendaciones; tus notas alimentan las tarjetas y el Tutor.'] },
      { heading: 'Funciona donde estudias', paragraphs: ['iPhone y iPad comparten la misma app universal. La web usa la misma cuenta para que puedas organizar un PDF desde una computadora y revisar el plan desde tu teléfono.'] },
    ],
    faq: [
      { question: '¿Qué funciones son gratis?', answer: 'El escáner con cinco usos mensuales, hasta cuatro cursos en un semestre, tareas, fechas, calificaciones y recordatorios el mismo día.' },
      { question: '¿Qué añade Pro?', answer: 'Cursos ilimitados, LMS, Plan Inteligente, Tutor, tarjetas, temporizador, pronósticos, alertas y sincronización de calendario.' },
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
      { heading: 'Cómo interpretar el resultado', paragraphs: ['Verifica la escala de tu institución: algunas universidades no asignan 4.0 a A+ o usan valores diferentes para más y menos. Esta calculadora usa una escala estándar de 4.0.'] },
      { heading: 'Del cálculo al seguimiento', paragraphs: ['Semora también calcula promedios ponderados dentro de cada curso a medida que registras tareas. Pro añade pronósticos para estimar qué necesitas en el trabajo restante.'] },
    ],
    faq: [
      { question: '¿La calculadora guarda mis cursos?', answer: 'No. El cálculo ocurre en tu navegador y se restablece al cerrar o actualizar la página.' },
      { question: '¿A+ vale 4.0?', answer: 'En esta herramienta sí. Consulta la escala oficial de tu institución porque algunas usan valores diferentes.' },
    ],
  }),
  page('/es/temporizador-pomodoro', '/pomodoro-timer', 'pomodoro', {
    metaTitle: 'Temporizador Pomodoro gratis para estudiantes',
    metaDescription: 'Temporizador de enfoque con sesiones de 15, 25, 45 o 50 minutos y descansos ajustables.',
    h1: 'Temporizador Pomodoro para estudiar entre clases',
    lede: 'Elige una sesión que quepa en el tiempo que realmente tienes. El reloj se mantiene preciso aunque cambies de pestaña.',
    intro: [
      'La técnica Pomodoro alterna trabajo concentrado y descanso. No necesitas usar siempre 25 minutos: una pausa entre clases puede funcionar mejor con 15, mientras que una lectura larga puede necesitar 45 o 50.',
    ],
    sections: [
      { heading: 'Cómo usarlo', paragraphs: ['Elige una duración, define el descanso, empieza con una tarea concreta y evita cambiar de objetivo durante el bloque. Cuando termine, descansa de verdad antes de continuar.'] },
      { heading: 'Haz que cada bloque tenga una intención', paragraphs: ['“Estudiar química” es demasiado amplio. “Resolver los problemas 1–8 sin apuntes” crea un final claro y te permite medir si el bloque funcionó.'] },
      { heading: 'Conecta el enfoque con tu semestre', paragraphs: ['El temporizador de Semora Pro vive junto a tus tareas y tu Plan Inteligente, para que la sesión que completes tenga relación con una fecha real.'] },
    ],
    faq: [
      { question: '¿Tengo que usar 25 minutos?', answer: 'No. Puedes elegir 15, 25, 45 o 50 minutos y descansos de 5, 10 o 15.' },
      { question: '¿El temporizador sigue si cambio de pestaña?', answer: 'Sí. Calcula el tiempo con una hora de finalización para corregir la reducción de actividad que aplican los navegadores en segundo plano.' },
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
    h1: 'Compara por el trabajo que realmente necesitas hacer',
    lede: 'No todas las aplicaciones para estudiantes resuelven el mismo problema. Estas comparaciones separan organización del semestre, estudio con IA y gestión general de tareas.',
    intro: ['Semora empieza con el programa del curso y construye fechas, calificaciones y planificación conectadas. Otras herramientas pueden priorizar resúmenes, tarjetas, proyectos generales o entrada manual.'],
    sections: [
      { heading: 'Cómo leer las comparaciones', paragraphs: ['Revisa primero cómo entra la información, después qué mantiene actualizado el producto y finalmente cuánto trabajo manual queda. Un catálogo largo de funciones no ayuda si todavía debes copiar cada fecha por tu cuenta.'] },
    ],
    faq: [],
  }),
];

const KEYWORD_PAGES: SpanishPageConfig[] = [
  page('/es/escaner-de-programa-de-estudios', '/ai-syllabus-scanner', 'standard', {
    metaTitle: 'Escáner de programas de estudios con IA',
    metaDescription: 'Extrae tareas, exámenes, horarios y porcentajes desde fotos, PDFs o texto y revisa todo antes de guardar.',
    h1: 'Convierte un programa de estudios en un semestre organizado',
    lede: 'Sube el documento una vez. OpenAI GPT-5.6 Luna encuentra la estructura académica y Semora te permite verificar cada resultado.',
    intro: ['Un programa puede esconder fechas en tablas, párrafos, calendarios y notas al pie. Copiarlas manualmente es lento y fácil de hacer mal. El escáner convierte ese contenido en campos que puedes revisar.'],
    sections: [
      { heading: 'Cuatro maneras de importar', paragraphs: ['Toma una foto de hasta cinco páginas, sube un PDF, arrastra un archivo en la web o pega texto desde un visor de PDF o una página LMS.'], bullets: ['Nombre y código del curso', 'Profesor, horarios y oficina', 'Fechas del semestre y escala de notas', 'Tareas, exámenes, proyectos, lecturas y porcentajes'] },
      { heading: 'La revisión evita que una suposición se convierta en una fecha', paragraphs: ['Los resultados con menor confianza se marcan para revisión. Los elementos sin fecha quedan separados y desactivados hasta que los corrijas. Nada llega a tu calendario automáticamente solo porque la IA lo sugirió.'] },
      { heading: 'Después del escaneo', paragraphs: ['Las fechas alimentan la vista Hoy, el calendario, recordatorios, carga académica y Plan Inteligente. Las categorías y porcentajes preparan el seguimiento de calificaciones.'] },
    ],
    faq: [
      { question: '¿Puede leer un PDF escaneado?', answer: 'Sí. Los PDFs y las imágenes compatibles se procesan visualmente. Para mejores resultados usa páginas enfocadas, rectas y con buena luz.' },
      { question: '¿Guarda algo sin preguntarme?', answer: 'No. Primero revisas y editas el resultado; luego eliges qué guardar.' },
      { question: '¿Cuántos escaneos son gratis?', answer: 'Cinco escaneos exitosos por mes calendario. Pro elimina el límite mensual.' },
    ],
  }),
  page('/es/planificador-de-estudio-con-ia', '/ai-study-planner-for-college', 'standard', {
    metaTitle: 'Planificador de estudio con IA para la universidad',
    metaDescription: 'Crea un plan adaptativo desde tus fechas reales, hábitos, exámenes, calificaciones y tiempo disponible.',
    h1: 'Un plan de estudio que aprende de tu semestre',
    lede: 'Plan Inteligente distribuye trabajo antes de las fechas importantes, reajusta lo que no completaste y explica cada cambio.',
    intro: ['Una lista de tareas te dice qué existe. Un plan útil también decide cuándo empezar, cuánto tiempo reservar y qué mover cuando la semana cambia.'],
    sections: [
      { heading: 'Señales que usa el plan', paragraphs: ['El plan considera fechas y dificultad, proximidad de exámenes, bloques disponibles, tiempo real de finalización, sesiones perdidas, cambios del calendario y riesgo de calificación.'], bullets: ['Empieza antes los trabajos grandes', 'Protege tiempo para exámenes cercanos', 'Reduce o mueve sesiones cuando ya no caben', 'Prioriza cursos donde una nota puede cambiar más'] },
      { heading: 'Cada ajuste tiene una razón', paragraphs: ['En lugar de mover bloques silenciosamente, Semora muestra si el cambio se debe a una fecha nueva, una sesión perdida, un examen cercano, disponibilidad diferente o riesgo académico.'] },
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
    lede: 'Canvas contiene las tareas. Semora las combina con horarios, calificaciones, recordatorios y planificación entre todos tus cursos.',
    intro: ['Un anuncio o cambio de fecha puede quedar enterrado dentro de un curso. Semora reúne las entregas en una sola vista y registra cuándo se sincronizaron.'],
    sections: [
      { heading: 'Conexión flexible', paragraphs: ['Los estudiantes pueden conectar Canvas con un token personal cuando su institución lo permite. Si una escuela aprueba OAuth, el flujo puede abrir una autorización directa. La disponibilidad depende de la institución.'] },
      { heading: 'Sincronización automática y recuperable', paragraphs: ['Al activar la sincronización automática, Semora revisa cambios en segundo plano. El historial muestra la última actualización, cursos incluidos, elementos importados y errores que necesitan atención.'], bullets: ['Mapeo de cursos para evitar duplicados', 'Actualización de fechas y calificaciones', 'Reintentos con mensajes claros', 'Desconexión que elimina la credencial guardada'] },
      { heading: 'Canvas más el programa', paragraphs: ['Canvas puede no incluir oficina, escala de calificación o el calendario completo. Escanear el programa añade ese contexto sin reemplazar los datos oficiales de Canvas.'] },
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
    why: 'El programa contiene la estructura del curso, pero suele llegar como un documento difícil de convertir en acciones. El escáner hace esa primera organización sin quitarte la revisión final.',
    steps: ['Añade una foto, PDF o texto.', 'Luna extrae campos y asigna confianza.', 'Corrige cualquier dato dudoso.', 'Guarda solamente los elementos seleccionados.'],
    result: 'Obtienes un curso con fechas, horarios, escala de calificaciones y tareas listo para alimentar el resto de Semora.',
    faq: [{ question: '¿Qué formatos admite?', answer: 'PDF, JPEG, PNG y WEBP; en la web también puedes pegar texto.' }],
  },
  'grade-tracking': {
    why: 'Una lista de notas no responde cuánto vale cada actividad ni qué parte del curso ya fue evaluada. El promedio ponderado sí.',
    steps: ['Registra puntuación y porcentaje.', 'Agrupa por categorías cuando el curso las usa.', 'Compara el promedio actual con tu escala.', 'Usa Pro para probar resultados futuros.'],
    result: 'Ves tu posición actual y qué resultados futuros tienen mayor impacto.',
    faq: [{ question: '¿Cuenta tareas sin nota?', answer: 'No. El promedio actual refleja el trabajo ya calificado; los pronósticos manejan lo pendiente por separado.' }],
  },
  'smart-plan': {
    why: 'Las fechas por sí solas no reservan tiempo. Plan Inteligente convierte prioridad, riesgo y disponibilidad en bloques concretos.',
    steps: ['Lee fechas y exámenes próximos.', 'Estima bloques según tamaño y riesgo.', 'Observa sesiones terminadas o perdidas.', 'Reajusta y explica cada cambio.'],
    result: 'Tienes una propuesta diaria que reacciona a la realidad en lugar de quedarse congelada al inicio del semestre.',
    faq: [{ question: '¿Puedo mover un bloque?', answer: 'Sí. El plan es una recomendación editable y usa tus cambios como nueva información.' }],
  },
  flashcards: {
    why: 'Crear tarjetas consume tiempo antes de que empiece el repaso. Semora usa el material que ya vinculaste al curso.',
    steps: ['Elige todo el curso o una evaluación.', 'Selecciona programa y notas relevantes.', 'Genera y revisa las tarjetas.', 'Repasa con repetición espaciada.'],
    result: 'El mazo se concentra en material del curso y puedes editar o añadir tarjetas manuales.',
    faq: [{ question: '¿Puedo crear tarjetas sin IA?', answer: 'Sí. Cada mazo también admite tarjetas manuales.' }],
  },
  'focus-timer': {
    why: 'Los bloques abiertos se alargan o se interrumpen. Un intervalo con principio y final facilita empezar.',
    steps: ['Elige 15, 25, 45 o 50 minutos.', 'Define un objetivo concreto.', 'Trabaja sin cambiar de tarea.', 'Descansa 5, 10 o 15 minutos.'],
    result: 'Acumulas sesiones pequeñas y medibles que caben entre clases.',
    faq: [{ question: '¿Funciona en segundo plano?', answer: 'El reloj se corrige con la hora real cuando vuelves a la pestaña.' }],
  },
  'ai-tutor': {
    why: 'Un chat general no conoce qué cubre tu curso ni qué vence después. El Tutor usa las fuentes que vinculaste.',
    steps: ['Abre el Tutor desde un curso.', 'Pregunta o elige práctica.', 'Revisa citas al programa, notas o tareas.', 'Sigue recomendaciones basadas en temas débiles y fechas.'],
    result: 'Recibes explicaciones, cuestionarios, tarjetas y sugerencias conectadas con el contexto real del curso.',
    faq: [{ question: '¿Puede inventar una fecha?', answer: 'Las preguntas de fechas se responden desde tus tareas guardadas. Si la fecha no existe, el Tutor debe decirlo.' }],
  },
  collaboration: {
    why: 'Los grupos pierden tiempo comparando versiones distintas de la misma fecha. Un Espacio de curso mantiene una fuente compartida.',
    steps: ['Un usuario Pro crea el espacio.', 'Comparte el enlace de invitación.', 'Los compañeros se unen gratis.', 'Las fechas y tareas de grupo se actualizan para todos.'],
    result: 'El grupo ve el mismo calendario sin depender de capturas o mensajes antiguos.',
    faq: [{ question: '¿Unirse requiere Pro?', answer: 'No. Crear y alojar el espacio es Pro; unirse mediante invitación es gratis.' }],
  },
  'canvas-sync': {
    why: 'Las plataformas académicas separan cada curso. Semora reúne sus fechas y conserva el historial de actualización.',
    steps: ['Conecta el acceso permitido por tu escuela.', 'Mapea los cursos correctos.', 'Elige sincronización manual o automática.', 'Revisa la última actualización y cualquier error.'],
    result: 'Las tareas, entregas y calificaciones seleccionadas se mantienen conectadas sin crear duplicados.',
    faq: [{ question: '¿Dónde se guarda el token?', answer: 'De forma predeterminada permanece en el dispositivo. Si activas sincronización automática, se guarda cifrado en Supabase Vault hasta que la desactives o desconectes.' }],
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
      { heading: feature.tier === 'pro' ? 'Incluido con Semora Pro' : 'Incluido en el plan Gratis', paragraphs: [feature.tier === 'pro' ? 'Crea primero una cuenta gratis. Puedes probar escaneos, cursos y calificaciones antes de mejorar a Pro.' : 'Puedes empezar sin tarjeta de crédito. El plan Gratis incluye cinco escaneos por mes y hasta cuatro cursos en un semestre.'] },
    ],
    faq: [
      ...detail.faq,
      { question: `¿${feature.name} funciona en iPhone, iPad y web?`, answer: 'Sí. La misma cuenta mantiene tus datos disponibles en las tres plataformas; algunas integraciones del dispositivo pueden variar.' },
    ],
  }, feature);
});

export const SPANISH_BLOG_POSTS = [
  {
    path: '/es/blog/convertir-programa-en-calendario',
    englishPath: '/blog/syllabus-to-semester-calendar',
    title: 'Cómo convertir un programa de estudios en un calendario del semestre',
    description: 'Un método paso a paso para sacar fechas, horarios y porcentajes de un programa y convertirlos en un plan útil.',
    date: '20 de julio de 2026',
    image: '/illustrations/syllabus-calendar.svg',
  },
  {
    path: '/es/blog/calcular-gpa-ponderado',
    englishPath: '/blog/weighted-gpa-calculator',
    title: 'Cómo calcular un GPA ponderado con ejemplos reales',
    description: 'La fórmula, los puntos de calidad y la diferencia entre créditos, porcentajes y promedios simples.',
    date: '21 de julio de 2026',
    image: '/illustrations/grade-card.svg',
  },
  {
    path: '/es/blog/mejores-apps-fechas-universidad-2026',
    englishPath: '/blog/best-college-deadline-tracking-apps-2026',
    title: 'Mejores apps para seguir fechas universitarias en 2026',
    description: 'Qué buscar en un planificador y cómo comparar entrada manual, LMS y escaneo del programa.',
    date: '22 de julio de 2026',
    image: '/illustrations/trophy-compare.svg',
  },
  {
    path: '/es/blog/recordatorios-fechas-canvas',
    englishPath: '/blog/canvas-deadline-reminders',
    title: 'Cómo obtener mejores recordatorios de fechas de Canvas',
    description: 'Por qué las notificaciones se pierden y cómo convertir cambios de Canvas en recordatorios útiles.',
    date: '23 de julio de 2026',
    image: '/illustrations/bell-reminder.svg',
  },
  {
    path: '/es/blog/tecnica-pomodoro-entre-clases',
    englishPath: '/blog/pomodoro-technique-between-classes',
    title: 'La técnica Pomodoro entre clases',
    description: 'Cómo adaptar sesiones de enfoque a los espacios reales de un horario universitario.',
    date: '24 de julio de 2026',
    image: '/illustrations/tomato-timer.svg',
  },
  {
    path: '/es/blog/plan-de-estudio-para-finales',
    englishPath: '/blog/finals-week-study-plan',
    title: 'Cómo crear un plan de estudio para finales',
    description: 'Prioriza por fecha, porcentaje, dominio y tiempo disponible sin sobrecargar los últimos días.',
    date: '25 de julio de 2026',
    image: '/illustrations/book-stack.svg',
  },
] as const;

const BLOG_PAGES: SpanishPageConfig[] = [
  page(SPANISH_BLOG_POSTS[0].path, SPANISH_BLOG_POSTS[0].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[0].title,
    metaDescription: SPANISH_BLOG_POSTS[0].description,
    h1: SPANISH_BLOG_POSTS[0].title,
    lede: 'El objetivo no es copiar cada palabra. Es separar la información que cambia tus decisiones durante el semestre.',
    intro: [
      'Un programa mezcla políticas, lecturas, fechas, horarios y porcentajes. Antes de abrir el calendario, define qué datos necesitas y cuál es la fuente oficial cuando dos fechas no coinciden.',
    ],
    sections: [
      {
        heading: '1. Reúne una versión legible',
        paragraphs: ['Descarga el PDF original si existe. Para papel, usa fotos rectas, enfocadas y con buena luz. Si el documento vive dentro del LMS, copia el texto o imprime a PDF.'],
      },
      {
        heading: '2. Extrae primero la estructura del curso',
        paragraphs: ['Anota nombre, profesor, horarios, ubicación, fechas del semestre y escala de calificaciones. Esos datos sirven para interpretar las tareas que aparecen después.'],
      },
      {
        heading: '3. Convierte cada entrega en una entrada concreta',
        paragraphs: ['Cada elemento debe tener título, curso, tipo, fecha, hora y porcentaje cuando se conozcan. Separa “sin fecha” de “sin importancia”: un examen final sin fecha sigue necesitando seguimiento.'],
        bullets: ['Tareas y listas de problemas', 'Exámenes y pruebas', 'Proyectos y presentaciones', 'Lecturas con entrega o discusión', 'Laboratorios e informes'],
      },
      {
        heading: '4. Revisa antes de activar recordatorios',
        paragraphs: ['Busca años incorrectos, fechas reutilizadas de otro semestre, zonas horarias y tablas que separan la fecha del nombre. Solo después configura recordatorios y bloques de estudio.'],
      },
      {
        heading: '5. Mantén el calendario vivo',
        paragraphs: ['El programa es el punto de partida. Los anuncios y el LMS pueden cambiar fechas. Registra la última actualización y conserva la fuente del cambio para no terminar con dos versiones de la misma tarea.'],
      },
      {
        heading: 'Cómo lo automatiza Semora',
        paragraphs: ['El escáner extrae la estructura, te presenta una revisión y crea el curso solamente después de tu aprobación. Las conexiones LMS pueden actualizar tareas posteriormente y el historial muestra qué cambió.'],
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
    lede: 'Un promedio ponderado responde cuánto cuenta cada curso; un promedio simple trata todo como si tuviera el mismo peso.',
    intro: ['Para calcular el GPA necesitas la calificación en letras, los puntos que asigna tu institución y los créditos de cada curso. Los porcentajes dentro de un curso son otro cálculo distinto.'],
    sections: [
      { heading: 'La fórmula del GPA', paragraphs: ['Multiplica los puntos de cada letra por los créditos del curso. Suma esos puntos de calidad y divídelos entre los créditos totales: GPA = Σ(puntos × créditos) ÷ Σ(créditos).'] },
      { heading: 'Ejemplo de tres cursos', paragraphs: ['Una A en 3 créditos aporta 12 puntos de calidad. Una B+ en 3 créditos aporta 9.9. Una A− en 4 créditos aporta 14.8. El total es 36.7 ÷ 10 = 3.67.'] },
      { heading: 'Errores comunes', paragraphs: ['No promedies las letras directamente, no cuentes un curso sin calificación como cero y no asumas que todas las instituciones usan la misma escala. Verifica también cómo manejan cursos repetidos, pass/fail y transferencias.'] },
      { heading: 'GPA y nota dentro del curso', paragraphs: ['El GPA combina cursos por créditos. La nota de un curso suele combinar tareas por porcentajes o categorías. Semora mantiene ambos cálculos separados para que una tarea de 5% no parezca igual a un examen de 30%.'] },
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
    lede: 'La mejor app es la que reduce el trabajo de mantenerla y te ayuda a actuar antes de que una fecha se vuelva urgente.',
    intro: ['Compara las herramientas por cómo reciben tus datos, cómo manejan cambios y qué decisiones te ayudan a tomar. Una app bonita todavía falla si debes copiar todo manualmente cada semana.'],
    sections: [
      { heading: 'Planificadores de entrada manual', paragraphs: ['Son flexibles y fáciles de entender. Funcionan bien para pocos cursos, pero dependen de que recuerdes cada anuncio, cambio y porcentaje. Busca importación, recordatorios y edición rápida.'] },
      { heading: 'Herramientas conectadas al LMS', paragraphs: ['Reducen la entrada manual cuando tu escuela permite acceso. Revisa si importan solo tareas o también calificaciones y cambios, si muestran la última sincronización y cómo recuperan errores.'] },
      { heading: 'Escáneres de programas', paragraphs: ['Son útiles al principio del semestre porque el programa contiene fechas que todavía no aparecen en el LMS. La revisión es indispensable: una IA debe mostrar incertidumbre en lugar de guardar suposiciones.'] },
      { heading: 'Planificación y estudio', paragraphs: ['Calendario, GPA, tarjetas, temporizador y tutor son valiosos cuando comparten el mismo contexto. Si cada función exige volver a subir el material, el sistema crea más mantenimiento.'] },
      { heading: 'Lista de evaluación', paragraphs: [], bullets: ['¿Funciona en tus dispositivos?', '¿Mantiene una sola cuenta sincronizada?', '¿Puedes exportar o eliminar tus datos?', '¿Explica los límites Gratis y Pro antes de registrarte?', '¿Las fechas importantes conservan su fuente?'] },
    ],
    faq: [
      { question: '¿Debo elegir una app conectada a Canvas?', answer: 'Solo si tu institución permite una conexión estable. Un buen escáner o importación manual sigue siendo importante para la información que Canvas no incluye.' },
      { question: '¿Más funciones significa mejor?', answer: 'No necesariamente. Prioriza el flujo que usarás cada semana y cuánto trabajo manual necesita.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[3].path, SPANISH_BLOG_POSTS[3].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[3].title,
    metaDescription: SPANISH_BLOG_POSTS[3].description,
    h1: SPANISH_BLOG_POSTS[3].title,
    lede: 'Las notificaciones del LMS informan actividad. Un sistema de recordatorios debe ayudarte a prepararte antes.',
    intro: ['Canvas puede enviar anuncios, comentarios, mensajes y cambios de calificación. Cuando todo tiene la misma urgencia, una fecha importante se pierde entre alertas que no requieren acción.'],
    sections: [
      { heading: 'Separa notificación de recordatorio', paragraphs: ['Una notificación dice que algo ocurrió. Un recordatorio reserva atención para lo que debes hacer. Mantén alertas inmediatas para cambios críticos y usa recordatorios con anticipación para entregas.'] },
      { heading: 'Reúne todos los cursos', paragraphs: ['Una vista por curso obliga a repetir la comparación mental. Una lista global puede mostrar el siguiente vencimiento, trabajo atrasado y semanas con varios exámenes.'] },
      { heading: 'Actualiza cuando cambia la fuente', paragraphs: ['Si Canvas mueve una fecha, el recordatorio debe moverse con ella. El historial de sincronización debe decir cuándo se revisó la plataforma y si alguna actualización falló.'] },
      { heading: 'Añade contexto del programa', paragraphs: ['El programa suele contener porcentajes, horarios y políticas que Canvas omite. Combinar ambos permite distinguir una tarea pequeña de un examen que puede cambiar la nota final.'] },
    ],
    faq: [
      { question: '¿Semora reemplaza las notificaciones de Canvas?', answer: 'No. Añade una capa personal de organización y recordatorios; Canvas sigue siendo la fuente oficial de tu curso.' },
      { question: '¿Puedo elegir la anticipación?', answer: 'El plan Gratis incluye recordatorios el mismo día. Pro permite avisos de uno y tres días.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[4].path, SPANISH_BLOG_POSTS[4].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[4].title,
    metaDescription: SPANISH_BLOG_POSTS[4].description,
    h1: SPANISH_BLOG_POSTS[4].title,
    lede: 'No necesitas una tarde libre para progresar. Necesitas un bloque que termine antes de tu próxima obligación.',
    intro: ['El Pomodoro clásico usa 25 minutos de trabajo y 5 de descanso. En la universidad, la duración debe adaptarse al espacio entre clases y al tipo de tarea.'],
    sections: [
      { heading: 'Bloques de 15 minutos', paragraphs: ['Úsalos para organizar apuntes, responder preguntas cortas, revisar tarjetas o preparar lo necesario para una sesión más larga. El objetivo debe ser pequeño y específico.'] },
      { heading: 'Bloques de 25 minutos', paragraphs: ['Funcionan bien para lectura activa, una sección de problemas o un borrador. Deja dos minutos al final para anotar el siguiente paso.'] },
      { heading: 'Bloques de 45 o 50 minutos', paragraphs: ['Reserva estas sesiones para práctica profunda, ensayos o problemas que necesitan contexto continuo. Después toma un descanso real de 10 o 15 minutos.'] },
      { heading: 'Evita medir solo tiempo', paragraphs: ['Cuenta también qué terminaste y qué aprendiste. Si tres bloques no resuelven el mismo tipo de problema, cambia de estrategia o busca ayuda en lugar de acumular minutos.'] },
    ],
    faq: [
      { question: '¿Puedo usar el teléfono durante el descanso?', answer: 'Puedes, pero un descanso con movimiento, agua o vista lejana suele facilitar volver a concentrarte.' },
      { question: '¿Qué hago si me interrumpen?', answer: 'Pausa si la interrupción es breve. Si cambia completamente tu contexto, reinicia con un objetivo más pequeño cuando vuelvas.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[5].path, SPANISH_BLOG_POSTS[5].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[5].title,
    metaDescription: SPANISH_BLOG_POSTS[5].description,
    h1: SPANISH_BLOG_POSTS[5].title,
    lede: 'Finales no se planifica repartiendo horas por igual. Se planifica según fecha, peso, dominio y capacidad real.',
    intro: ['Empieza con una lista de todos los exámenes y entregas, incluyendo hora, porcentaje, formato y material cubierto. Después estima cuánto control tienes sobre cada tema.'],
    sections: [
      { heading: '1. Calcula la presión de cada evaluación', paragraphs: ['Una evaluación cercana, de alto porcentaje y bajo dominio necesita atención antes que una lejana, pequeña y ya dominada. Usa esas cuatro señales para ordenar, no solo la fecha.'] },
      { heading: '2. Divide el material en resultados observables', paragraphs: ['Cambia “estudiar biología” por “explicar respiración celular sin apuntes” o “resolver diez preguntas mixtas y revisar errores”. Cada bloque debe terminar con evidencia.'] },
      { heading: '3. Distribuye práctica y recuperación', paragraphs: ['Alterna recuerdo activo, problemas, explicación y simulaciones. Deja espacio entre revisiones del mismo tema para que el siguiente intento mida memoria, no familiaridad inmediata.'] },
      { heading: '4. Protege sueño, comida y traslado', paragraphs: ['Un plan que usa cada minuto disponible se rompe con el primer retraso. Conserva márgenes y fija una hora para terminar la noche antes de un examen.'] },
      { heading: '5. Recalcula cada día', paragraphs: ['Marca lo terminado, reduce lo que ya dominas y mueve lo que falló. Si el tiempo no alcanza, elimina tareas de bajo impacto de forma explícita en lugar de fingir que todo cabe.'] },
    ],
    faq: [
      { question: '¿Cuándo debo empezar?', answer: 'Tan pronto tengas el calendario de finales. Incluso diez minutos para listar evaluaciones y material reduce decisiones posteriores.' },
      { question: '¿Cómo priorizo dos exámenes el mismo día?', answer: 'Compara peso, nivel actual, cantidad de material y oportunidades futuras. Alterna bloques para evitar abandonar por completo uno de los cursos.' },
    ],
  }),
];

export const SPANISH_COMPARISONS = [
  { slug: 'dormway', name: 'DormWay', focus: 'una experiencia académica y de campus más amplia' },
  { slug: 'shovel', name: 'Shovel', focus: 'planificación de estudio por tiempo e integración con LMS' },
  { slug: 'studyfetch', name: 'StudyFetch', focus: 'generación de materiales de estudio con IA' },
  { slug: 'mindgrasp', name: 'Mindgrasp', focus: 'resúmenes, notas y preguntas desde documentos y videos' },
  { slug: 'taskade', name: 'Taskade', focus: 'gestión general de proyectos y agentes de IA' },
  { slug: 'studley-ai', name: 'Studley AI', focus: 'tarjetas, cuestionarios y contenido de estudio generado' },
  { slug: 'myhomework', name: 'myHomework Student Planner', focus: 'planificación manual multiplataforma e importación LMS' },
] as const;

function comparisonPage(item: (typeof SPANISH_COMPARISONS)[number]): SpanishPageConfig {
  return page(`/es/comparar/${item.slug}`, `/compare/${item.slug}`, 'standard', {
    metaTitle: `Semora vs ${item.name}`,
    metaDescription: `Compara Semora y ${item.name}: programas, fechas, calificaciones, estudio con IA, plataformas y trabajo manual.`,
    h1: `Semora vs ${item.name}`,
    lede: `La diferencia principal es el punto de partida: Semora organiza el semestre desde el programa; ${item.name} se concentra en ${item.focus}.`,
    intro: [
      'La mejor opción depende del problema que quieres eliminar. Compara cómo entra la información, qué se mantiene actualizado y qué decisiones puedes tomar después.',
    ],
    sections: [
      {
        heading: 'Qué hace Semora',
        paragraphs: [
          'Semora convierte una foto, PDF o texto del programa en cursos, tareas, exámenes, horarios y calificaciones revisables. También puede importar desde Canvas, Blackboard o Moodle. Esa información alimenta recordatorios, pronósticos, Plan Inteligente, tarjetas y Tutor con IA.',
        ],
      },
      {
        heading: `Dónde encaja ${item.name}`,
        paragraphs: [
          `${item.name} prioriza ${item.focus}. Eso puede ser mejor si esa es tu necesidad central y no buscas que el programa del curso se convierta en la fuente compartida de fechas, calificaciones y planificación.`,
        ],
      },
      {
        heading: 'Preguntas que debes hacer antes de elegir',
        paragraphs: [],
        bullets: [
          '¿Debo copiar las fechas manualmente o puede leer el programa?',
          '¿Actualiza cambios del LMS y muestra cuándo sincronizó?',
          '¿Las calificaciones alimentan pronósticos y recomendaciones?',
          '¿Funciona con la misma cuenta en iPhone, iPad y web?',
          '¿Puedo revisar, exportar y eliminar mis datos?',
        ],
      },
      {
        heading: 'Cuándo elegir cada uno',
        paragraphs: [
          `Elige Semora si quieres una vista conectada del semestre y quieres empezar desde programas y fechas reales. Considera ${item.name} si tu prioridad principal es ${item.focus} y sus flujos específicos encajan mejor con tu manera de estudiar.`,
        ],
      },
    ],
    faq: [
      { question: `¿Semora reemplaza completamente a ${item.name}?`, answer: 'No necesariamente. Las herramientas pueden resolver problemas distintos. La comparación ayuda a decidir cuál debe ser tu sistema principal.' },
      { question: '¿Puedo probar Semora gratis?', answer: 'Sí. El plan Gratis no requiere tarjeta e incluye cinco escaneos mensuales, cuatro cursos en un semestre, fechas y calificaciones.' },
    ],
  });
}

const COMPARISON_PAGES = SPANISH_COMPARISONS.map(comparisonPage);

const ALTERNATIVES = [
  { slug: 'alternativa-a-dormway', english: '/dormway-alternative', name: 'DormWay', need: 'organización del semestre desde el programa y seguimiento de calificaciones' },
  { slug: 'alternativa-a-shovel', english: '/shovel-alternative', name: 'Shovel', need: 'un escáner de programas con revisión y una cuenta sencilla entre iOS y web' },
  { slug: 'alternativa-a-studyfetch', english: '/studyfetch-alternative', name: 'StudyFetch', need: 'fechas, calificaciones y planificación además de herramientas de estudio con IA' },
  { slug: 'alternativa-a-mindgrasp', english: '/mindgrasp-alternative', name: 'Mindgrasp', need: 'convertir el programa en calendario y seguimiento académico, no solo resumir material' },
  { slug: 'alternativa-a-myhomework', english: '/myhomework-alternative', name: 'myHomework', need: 'reducir la entrada manual mediante escaneo del programa y planificación adaptativa' },
] as const;

const ALTERNATIVE_PAGES = ALTERNATIVES.map((item) => page(`/es/${item.slug}`, item.english, 'standard', {
  metaTitle: `Alternativa a ${item.name} para estudiantes`,
  metaDescription: `Conoce Semora como alternativa a ${item.name} para programas, fechas, calificaciones y planificación universitaria.`,
  h1: `¿Buscas una alternativa a ${item.name}?`,
  lede: `Semora puede encajar si necesitas ${item.need}.`,
  intro: [
    `Cambiar de herramienta vale la pena cuando elimina trabajo repetido. Antes de mover tus cursos, identifica qué parte de ${item.name} te obliga a mantener información manualmente y qué datos necesitas conservar.`,
  ],
  sections: [
    { heading: 'Por qué considerar Semora', paragraphs: ['Semora empieza con una foto, PDF o texto del programa. Después de tu revisión crea tareas, exámenes, horarios y estructura de calificaciones. Las conexiones LMS pueden mantener cambios al día.'] },
    { heading: 'Qué puedes probar sin pagar', paragraphs: ['Crea una cuenta sin tarjeta y usa cinco escaneos al mes, hasta cuatro cursos en un semestre, seguimiento de fechas, promedios ponderados y recordatorios el mismo día.'] },
    { heading: 'Qué añade Pro', paragraphs: ['Pro elimina límites de cursos y semestres y añade Plan Inteligente, Canvas/Blackboard/Moodle, tarjetas, Tutor con IA, temporizador, pronósticos, alertas y sincronización de calendario.'] },
    { heading: 'Cómo hacer la transición', paragraphs: ['Empieza con un curso. Escanea el programa, revisa las fechas y compara el resultado con tu sistema actual durante una semana. No elimines tu fuente anterior hasta confirmar que todo lo importante está correcto.'] },
  ],
  faq: [
    { question: `¿Puedo usar Semora junto con ${item.name}?`, answer: 'Sí. Puedes probar un curso sin abandonar inmediatamente tu herramienta actual.' },
    { question: '¿Semora importa mis datos desde cualquier app?', answer: 'No existe una importación universal. Semora admite programas, entrada manual y conexiones seleccionadas con Canvas, Blackboard y Moodle.' },
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
