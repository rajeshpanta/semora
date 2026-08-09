import type { ReactNode } from 'react';
import type { NewPage } from './new-page-content';
import { FEATURES_ES, type SpanishFeatureFact } from './es-facts';
import { ES_FEATURE_CONTENT } from './es-feature-content';

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
    metaDescription: 'Escaneo de programas con IA, calificaciones ponderadas, Plan Inteligente, Tutor, tarjetas y Canvas. Lo que hace cada función y qué es gratis.',
    h1: 'Todo lo que necesitas para organizar el semestre',
    lede: 'Desde la primera foto del programa de una materia hasta la semana de finales: una sola cuenta para tus entregas, calificaciones y tiempo de estudio.',
    intro: [
      'Empieza gratis con cinco escaneos al mes, cuatro cursos, tareas, calificaciones y recordatorios. Pro añade automatización, cursos ilimitados y herramientas de estudio construidas sobre tus datos reales.',
    ],
    sections: [
      {
        heading: 'La primera semana llega en cinco PDF distintos',
        paragraphs: [
          'Cada profesor publica su programa a su manera. Uno lo entrega en una tabla, otro esconde los exámenes en un párrafo a mitad de página, y un tercero reparte las entregas por doce páginas de calendario. Copiar todo eso a mano es lo que hace que la mayoría de los planificadores se abandonen en la semana seis: el trabajo de mantenerlo al día pesa más que el problema que resuelven.',
          'Semora ataca ese momento concreto. En lugar de darte una lista vacía para que la llenes tú, lee el documento que ya contiene tu curso entero y lo convierte en un semestre que puedes revisar en unos minutos.',
        ],
      },
      {
        heading: 'Un escaneo, y el resto viene detrás',
        paragraphs: [
          'Semora no es una carpeta de herramientas sueltas: es una cadena. El escaneo es el paso de entrada y todo lo demás lee lo que ese escaneo produjo. Por eso la lista de funciones parece larga aunque el trabajo real sea corto — cada programa se toca una vez, más o menos lo que tardas en fotografiar cinco páginas, y las entregas, los horarios de clase, las ponderaciones y los cortes de la escala de notas que salen de ahí son la materia prima del calendario, de las calificaciones, del Plan Inteligente y del Tutor.',
          'La cadena corre en un orden concreto. El escáner extrae el curso y el profesor, los bloques de clase con sus días y aulas, el inicio y el final del semestre, la escala de calificación, y cada tarea, cuestionario, examen, proyecto y lectura que encuentra, con su fecha, su hora, su porcentaje y una puntuación de confianza. En un curso que creas por primera vez, la ficha del curso, sus horarios y su escala se escriben directamente. Solo las entregas esperan: aparecen en una pantalla de revisión donde editas, descartas y apruebas.',
          'Un reescaneo se comporta distinto a propósito, y conviene saberlo antes de que tu profesor publique la versión dos. Escanear un programa revisado sobre un curso que ya tienes incorpora las entregas nuevas, pero no reescribe el horario que ya tocaste: las filas de clases y de horario de atención solo se escriben al crear el curso, y la escala de calificación se sustituye únicamente si la dejaste como estaba por defecto. Una revisión que cambia el aula o convierte un 30 % de parcial en un 25 % llega como entregas y nada más; el horario y la escala los actualizas tú desde la pantalla del curso. Es un intercambio deliberado: la app prefiere conservar tus correcciones antes que sobrescribirlas con una suposición nueva.',
          'Todo lo que hay por encima de esa capa es análisis de esas mismas filas. El motor de carga académica puntúa cada tarea con fecha como su ponderación multiplicada por un factor de esfuerzo — un examen cuenta el triple, un proyecto 2,5, un cuestionario 1,5, una tarea 1,2 y una lectura 1 — así que una semana con dos exámenes se lee como pesada aunque tu profesor no imprimiera ningún porcentaje al lado. El Plan Inteligente toma esas mismas tareas y reparte sesiones de estudio en un horizonte de catorce días, esquivando las clases que el escaneo ya conoce. La revisión académica vigila tres cosas concretas: una nota que baja, trabajo que falta y una semana sobrecargada.',
          'Nada de esto obliga a usar el escáner. Puedes crear un curso a mano y añadir tú las entregas, las subtareas y las notas, y el cálculo de calificaciones, el Calendario, Hoy y los recordatorios se comportan igual con datos escritos a mano. El escaneo es un atajo para la parte tediosa, no un requisito de entrada — lo que pasa es que esa parte tediosa son cuatro programas de golpe en la primera semana.',
          'La consecuencia práctica conviene decirla claro: cada función de planificación y de estudio vale exactamente lo que tengas metido del semestre. Dos cursos a medias no le dan al Plan Inteligente ni a la carga académica casi nada sobre lo que razonar. Cuatro cursos escaneados, con sus ponderaciones reales y algunas notas puestas, afilan los dos en una semana. Escanea primero, califica sobre la marcha, y el resto del producto tiene con qué trabajar.',
        ],
        bullets: [
          'Escanear: curso, profesor, días, horas y aulas, fechas del semestre, escala de notas y cada elemento con fecha, ponderación y confianza.',
          'Reescanear: un programa revisado se incorpora al curso que ya tienes y trae las entregas. Los horarios no se sobrescriben nunca, y la escala solo si seguía por defecto.',
          'Revisar: solo las entregas necesitan tu aprobación. Lo que baja de 0,8 de confianza se marca para verificar, las fechas fuera del semestre se señalan y lo que llega sin fecha se separa.',
          'Seguir: Hoy muestra lo siguiente y lo atrasado; el Calendario enseña el semestre en vista de mes o de lista, con un color por curso.',
          'Calificar: un promedio ponderado que refleja solo lo ya corregido, con los puntos extra sumando al numerador sin inflar el denominador.',
          'Planificar: la carga académica nombra las semanas cargadas, el Plan Inteligente llena los días y la revisión académica dice qué se está escapando y por dónde empezar.',
          'Estudiar: las tarjetas y el Tutor trabajan sobre un curso que ya escaneaste.',
        ],
      },
      {
        heading: 'Cómo cambia la semana',
        paragraphs: [
          'La diferencia no está en tener más funciones, sino en cuánto trabajo manual desaparece.',
        ],
        bullets: [
          'Antes: copiar cada fecha a mano desde cinco programas. Con Semora: una foto por curso y una pantalla de revisión.',
          'Antes: una hoja de cálculo para saber tu nota. Con Semora: introduces la puntuación y el promedio ponderado se recalcula solo.',
          'Antes: descubrir la semana cargada cuando ya la tienes encima. Con Semora: la carga académica la señala con antelación.',
          'Antes: recordatorios que pones tú, cuando te acuerdas. Con Semora: se programan solos al aprobar las fechas.',
          'Antes: tres apps para calendario, notas y estudio. Con Semora: una cuenta donde todo lee los mismos datos.',
        ],
      },
      {
        heading: 'Qué cubren de verdad cinco escaneos y cuatro cursos',
        paragraphs: [
          'El plan gratuito son cinco escaneos por mes natural, hasta cuatro cursos y un semestre para la cuenta. Los tres números no se aplican igual, y la diferencia merece una frase. El límite de escaneos se comprueba en tres sitios: en la app, en la función que analiza el documento en el servidor antes de gastar nada en la extracción, y otra vez en un disparador de la base de datos. Los de cursos y semestre se comprueban en el servidor. No son cifras decorativas.',
          'Haz la cuenta de la primera semana. Una carga completa habitual son cuatro o cinco asignaturas. Cuatro programas son cuatro escaneos, así que queda uno de reserva dentro del mismo mes para el profesor que publica una versión corregida en la primera quincena. El contador no es una bolsa para toda la vida: se reinicia el día uno de cada mes natural, en UTC. Un programa que cambia en octubre te cuesta uno de los cinco de octubre, no uno de los que te quedan para siempre.',
          'Escaneos y cursos son límites distintos, y saberlo te ahorra dinero. Volver a escanear el programa de un curso que ya tienes se incorpora a ese curso — se emparejan por código, o por nombre exacto cuando el programa no trae código — así que gasta un escaneo pero no una plaza de curso. Lo que ese emparejamiento no hace es sobrescribir el horario: las entregas entran, las clases se quedan como las dejaste y la escala solo cambia si seguía por defecto.',
          'Queda un límite que conviene poner en el mapa, porque es el que se descubre tarde: una cuenta gratuita tiene un semestre en total. No uno activo cada vez, con otro nuevo cada cuatrimestre. Uno. Por eso el tope de cuatro cursos no se renueva en enero: en el plan gratuito no hay un segundo semestre que empezar. Borrar el semestre terminado desde la pestaña de Cursos es la única forma de liberar la plaza, y ese borrado arrastra lo que colgaba de él.',
        ],
        bullets: [
          'Cinco escaneos por mes natural, con reinicio el día 1 en UTC. Cinco páginas fotografiadas en un envío cuentan como uno.',
          'Cuatro cursos para la cuenta, no por semestre, porque el plan gratuito es de un semestre. Cubre justo una carga de cuatro y se queda a uno de una de cinco.',
          'Reescanear un curso que ya tienes se incorpora a él: gastas un escaneo, conservas la plaza y tus correcciones del horario siguen intactas.',
          'Las entregas, las tareas y las subtareas no tienen tope. Añade las que quieras en el plan gratuito.',
          'El seguimiento de calificaciones con promedios ponderados y la nota media del semestre son gratis, en todos tus cursos.',
          'Unirte al espacio de un curso que organiza un compañero es gratis; ten en cuenta que el curso que importa ocupa una de tus cuatro plazas.',
          'Un semestre en total en el plan gratuito; semestres y cursos ilimitados en Pro, sin tope mensual de escaneos.',
        ],
      },
      {
        heading: 'Dónde cae exactamente la línea de Pro',
        paragraphs: [
          'La forma limpia de describir el reparto: el plan gratuito basta para saber qué tienes que entregar y en qué punto estás. Pro es para decidir qué hacer al respecto, más el tejido que te conecta con otras plataformas, otras personas y otros calendarios. Nada del plan gratuito caduca ni se degrada por lo bajo: el contador de escaneos se rellena el día uno de cada mes y las calificaciones siguen siendo tuyas.',
          'Hay dos fronteras que se cuentan mal lo bastante a menudo como para decirlas directamente. La primera: la importación desde Canvas, Blackboard y Moodle es de Pro, no del plan gratuito. Está protegida en el servidor, así que el aviso no es una sugerencia del cliente que se pueda esquivar. La vía gratuita hacia Canvas existe y merece la pena: abre la página de tareas, selecciona el texto y pégalo en el escáner desde la web.',
          'La segunda: los espacios de curso se parten por la mitad. Organizar un curso compartido — crear el espacio y enviar la invitación — es de Pro, y esa comprobación también corre en el servidor. Unirte al espacio que te comparte un compañero es gratis, de forma permanente, sin límite de tiempo y sin tarjeta; lo único que hay que vigilar es que el curso que se importa ocupa una de tus cuatro plazas.',
          'Si dejas de pagar no se borra nada. Los límites del plan gratuito se comprueban al añadir algo nuevo, así que los cursos, semestres, entregas y calificaciones que ya tienes siguen siendo legibles y editables; lo que cambia es que las pantallas de Pro se bloquean otra vez y lo nuevo vuelve a regirse por los cinco escaneos al mes, los cuatro cursos y la regla de un solo semestre.',
          'El precio es 3,99 $ al mes o 19,99 $ al año, que sale a unos 1,67 $ al mes y alrededor de un 58 % menos que pagando mes a mes. La compra ocurre dentro de la app de iOS a través de StoreKit, y la suscripción se aplica a toda tu cuenta, incluida la app web. No hay una caja aparte en la web ni nada que activar: la web lee la misma suscripción que ya tienes.',
        ],
        bullets: [
          'Gratis: escanear, cuatro cursos, entregas y tareas ilimitadas, calificaciones ponderadas y nota media del semestre, recordatorios el mismo día, Hoy y Calendario completos.',
          'Capacidad de Pro: cursos y semestres ilimitados, y sin tope mensual de escaneos — el único techo que queda es el de uso razonable, 20 escaneos en cualquier ventana de 24 horas, que ningún semestre real alcanza.',
          'Decisiones de Pro: Plan Inteligente, carga académica, revisión académica, escala de calificación propia y pronósticos, y análisis del progreso con gráficos y exportación.',
          'Estudio con Pro: tarjetas con repetición espaciada, temporizador de enfoque y el Tutor con IA anclado en tu propio curso.',
          'Conexiones de Pro: importación desde Canvas, Blackboard y Moodle, organizar espacios de curso, sincronización con el calendario del dispositivo con exportación .ics, y recordatorios con uno y tres días de antelación.',
        ],
      },
      {
        heading: 'Empieza por lo que se te esté rompiendo',
        paragraphs: [
          'Las listas de funciones son una mala forma de elegir por dónde empezar, porque no tienes un problema de funciones: tienes algo concreto yendo mal. Busca el síntoma. Casi todo esto se configura en menos de diez minutos, y las dos cosas que más importan en la primera semana — escanear y llevar las notas — no cuestan nada.',
          'Si el problema es que de verdad no sabes qué tienes que entregar, escanea todos los programas que tengas y párate ahí por hoy. Hoy y el Calendario te sostienen durante semanas solo con el plan gratuito. Si el problema es que sabes lo que hay pero siempre empiezas tarde, eso es el Plan Inteligente: viene con 90 minutos al día en sesiones de 45 y se reajusta cuando una fecha se mueve.',
          'Si el problema es que no sabes si vas bien en una asignatura, empieza por las calificaciones: mete las notas que ya tienes y lee el promedio ponderado. Añade la escala propia y los pronósticos cuando necesites la pregunta al revés, que es cuánto te hace falta en lo que queda para cerrar con una nota concreta.',
        ],
        bullets: [
          '«No sé qué tengo que entregar» — escanea y luego Hoy. Gratis.',
          '«Lo sé, pero empiezo tarde» — Plan Inteligente, horizonte de 14 días, sesiones de 25, 45 o 50 minutos. Pro.',
          '«Me han caído dos exámenes la misma semana y no lo vi venir» — carga académica. Pro.',
          '«No sé en qué punto voy» — calificaciones y nota media del semestre (gratis), y después los pronósticos (Pro).',
          '«Pierdo los primeros veinte minutos de cada sesión» — tarjetas centradas en un examen concreto y temporizador de enfoque. Pro.',
          '«Mis entregas ya están en Canvas» — pega el texto de la tarea en el escáner desde la web (gratis), o conecta la plataforma con un token que generas tú (Pro).',
          '«Ya se me ha ido de las manos» — revisión académica: nombra la nota que baja, el trabajo que falta o la semana sobrecargada y te da un orden para recuperar. Pro.',
        ],
      },
      {
        heading: 'Una cuenta en iPhone, iPad y la web',
        paragraphs: [
          'Una cuenta y tres superficies: una app universal que funciona igual en iPhone y en iPad, y la web en cualquier navegador. Inicias sesión una vez. Los cursos, las entregas, las calificaciones y los ajustes viven en el servidor, así que no hay que exportar y volver a importar para cambiar de dispositivo, ni hay un aparato que guarde la copia buena. Exportar existe, pero como salida y no como apaño de sincronización: Pro añade el informe del semestre en CSV, una vista para imprimir y un archivo .ics con todo el curso.',
          'Los cambios se propagan por una conexión en tiempo real, no esperando a que refresques. Marcas algo en clase desde el móvil y la pestaña que dejaste abierta en la biblioteca se actualiza en segundos. Los cambios en bloque se tratan con cabeza: importar un programa escaneado escribe muchas entregas a la vez, y todas se agrupan en una sola actualización en lugar de en docenas. Cuando la app vuelve del segundo plano, cuando una pestaña recupera el foco o cuando un dispositivo se reconecta, Semora consulta una vez para recoger lo que se perdiera.',
          'Quedarte sin cobertura no te para, que es justo donde fallan casi todos los planificadores. Crear un curso o una tarea, editar cualquiera de los dos, marcarla como completada, marcar una subtarea y ajustar una categoría de calificación funcionan sin conexión y se guardan en cola en el dispositivo. Además, los últimos siete días de tus datos quedan en caché, así que abrir la app en un aula sin señal te enseña tu semestre real y no una pantalla vacía. Eliminar es lo único que espera a tener conexión.',
          'Y funciona en tu idioma: la app entera está en español, no solo este sitio — pantallas, recordatorios, el Tutor y cada etiqueta de la configuración. Semora arranca en español si tu dispositivo está en español, y la primera pantalla de bienvenida ofrece los dos idiomas antes de que haya que entender nada en inglés, que es justo la idea. Después vive en Mi cuenta > Configuración > Idioma, y la elección se guarda en tu cuenta, no en el aparato, así que te acompaña al iPad y a la web.',
          'Las superficies se diferencian donde se diferencia el hardware, y solo ahí. Escanear en iOS usa la cámara, tu fototeca o la app Archivos; la web añade arrastrar y soltar sobre el marco de escaneo y pegar texto, que es la vía más rápida y precisa cuando estás en un portátil con el programa ya abierto. La app de iPhone es vertical; en iPad gira en las cuatro orientaciones y se reajusta en Split View. Las ventanas anchas del navegador cambian a una barra lateral fija. iOS suma widgets en la pantalla de inicio y la sincronización con el calendario del dispositivo, que no funciona en un navegador: ahí el equivalente es la exportación .ics. Pro se compra solo en iOS y se lee en todas partes.',
        ],
        bullets: [
          'La misma cuenta y los mismos datos en iPhone, iPad y la web.',
          'No hay app para Android ni para Mac: en esos equipos Semora funciona en el navegador.',
          'Sincronización casi en tiempo real de cursos, entregas y semestres entre dispositivos.',
          'Consulta de puesta al día al volver del segundo plano, al recuperar el foco y al reconectar.',
          'Español completo en la app, elegido en la primera pantalla o en Configuración, y guardado en tu cuenta.',
          'Sin conexión: crea y edita cursos y tareas, márcalas como hechas, y todo se sincroniza solo.',
          'Solo en la web: arrastrar y soltar y pegar el texto del programa, de 20 a 60.000 caracteres.',
          'Solo en iOS: widgets en la pantalla de inicio, sincronización con el calendario del dispositivo y la compra de Pro que lo activa en toda la cuenta.',
          'Exportaciones de Pro desde cualquier sesión: informe del semestre en CSV, vista para imprimir y un .ics del curso.',
        ],
      },
    ],
    faq: [],
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
  // Hand-written Spanish long form when we have it. The template below is the
  // fallback for features not yet rewritten — it produced ~450 characters
  // against 18-24k on the English pages, which is why these are being replaced
  // one at a time rather than left to look translated.
  const long = ES_FEATURE_CONTENT[feature.englishSlug];
  if (long) {
    return page(`/es/funciones/${feature.slug}`, `/features/${feature.englishSlug}`, 'feature', {
      metaTitle: feature.name,
      metaDescription: feature.shortDescription,
      h1: feature.name,
      lede: long.lede,
      intro: long.intro,
      sections: long.sections,
      faq: [],
    }, feature);
  }
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
    faq: [],
  }, feature);
});

export const SPANISH_BLOG_POSTS = [
  {
    path: '/es/blog/convertir-programa-en-calendario',
    englishPath: '/blog/syllabus-to-semester-calendar',
    title: 'Cómo convertir el programa de una materia en un calendario del semestre',
    description: 'Un método paso a paso para extraer fechas, horarios y ponderaciones de un programa y convertirlos en un plan útil.',
    date: '20 de julio de 2026',
    isoDate: '2026-07-20',
    image: '/illustrations/syllabus-calendar.svg',
    imageAlt: 'Ilustración de la página de un programa que se convierte en un calendario con una fecha de entrega marcada',
  },
  {
    path: '/es/blog/calcular-gpa-ponderado',
    englishPath: '/blog/weighted-gpa-calculator',
    title: 'Cómo calcular un GPA ponderado con ejemplos reales',
    description: 'La fórmula, los puntos de calidad y la diferencia entre créditos, ponderaciones y promedios simples.',
    date: '21 de julio de 2026',
    isoDate: '2026-07-21',
    image: '/illustrations/grade-card.svg',
    imageAlt: 'Ilustración de una boleta de calificaciones con una nota A− y una insignia de estrella',
  },
  {
    path: '/es/blog/mejores-apps-fechas-universidad-2026',
    englishPath: '/blog/best-college-deadline-tracking-apps-2026',
    title: 'Las mejores apps para controlar las entregas universitarias en 2026',
    description: 'Qué buscar en un planificador y cómo comparar la entrada manual, la conexión con un LMS y el escaneo del programa.',
    date: '22 de julio de 2026',
    isoDate: '2026-07-22',
    image: '/illustrations/trophy-compare.svg',
    imageAlt: 'Ilustración de un trofeo sobre un podio que representa una comparación de apps',
  },
  {
    path: '/es/blog/recordatorios-fechas-canvas',
    englishPath: '/blog/canvas-deadline-reminders',
    title: 'Cómo recibir mejores recordatorios de Canvas',
    description: 'Por qué algunas notificaciones pasan desapercibidas y cómo convertir los cambios de Canvas en recordatorios útiles.',
    date: '23 de julio de 2026',
    isoDate: '2026-07-23',
    image: '/illustrations/bell-reminder.svg',
    imageAlt: 'Ilustración de una campana de recordatorio frente a la hoja de un calendario',
  },
  {
    path: '/es/blog/tecnica-pomodoro-entre-clases',
    englishPath: '/blog/pomodoro-technique-between-classes',
    title: 'La técnica Pomodoro entre clases',
    description: 'Cómo adaptar tus sesiones de concentración a los huecos reales de un horario universitario.',
    date: '24 de julio de 2026',
    isoDate: '2026-07-24',
    image: '/illustrations/tomato-timer.svg',
    imageAlt: 'Ilustración de un temporizador de cocina con forma de tomate, el origen de la técnica Pomodoro',
  },
  {
    path: '/es/blog/plan-de-estudio-para-finales',
    englishPath: '/blog/finals-week-study-plan',
    title: 'Cómo crear un plan de estudio para finales',
    description: 'Prioriza según la fecha, el peso de cada evaluación, tu dominio del tema y el tiempo disponible, sin sobrecargar los últimos días.',
    date: '25 de julio de 2026',
    isoDate: '2026-07-25',
    image: '/illustrations/book-stack.svg',
    imageAlt: 'Ilustración de una pila de libros de texto con un birrete encima',
  },
  {
    path: '/es/blog/mejores-apps-de-estudio-con-ia-2026',
    englishPath: '/blog/best-ai-study-apps-for-college-2026',
    title: 'Las mejores apps de estudio con IA para universitarios en 2026',
    description: 'Siete apps comparadas por lo que realmente hacen: escaneo del programa, tarjetas de estudio, tutoría y seguimiento de calificaciones, y qué categoría resuelve cada problema.',
    date: '5 de agosto de 2026',
    isoDate: '2026-08-05',
    image: '/illustrations/ai-study-apps.svg',
    imageAlt: 'Ilustración de una lista corta de tres apps, con la primera marcada con una palomita',
  },
  {
    path: '/es/blog/tarjetas-de-estudio-con-ia',
    englishPath: '/blog/ai-flashcards-from-lecture-notes',
    title: 'Cómo hacer tarjetas de estudio con IA a partir de tus apuntes',
    description: 'Qué hace que una tarjeta generada con IA valga la pena, cómo decide la repetición espaciada cuándo vuelves a verla y en qué se diferencian las herramientas.',
    date: '7 de agosto de 2026',
    isoDate: '2026-08-07',
    image: '/illustrations/flashcard-deck.svg',
    imageAlt: 'Ilustración de un mazo de tarjetas de estudio con la primera girando para mostrar su respuesta',
  },
  {
    path: '/es/blog/que-nota-necesito-en-el-examen-final',
    englishPath: '/blog/grade-needed-on-final-exam',
    title: '¿Qué nota necesito en el examen final?',
    description: 'La fórmula para saber qué necesitas sacar en el final, resuelta con ponderaciones reales, y los cuatro errores que dan un resultado equivocado.',
    date: '9 de agosto de 2026',
    isoDate: '2026-08-09',
    image: '/illustrations/final-grade-target.svg',
    imageAlt: 'Ilustración de un medidor que se llena hasta la nota que necesitas en el examen final',
  },
] as const;

const BLOG_PAGES: SpanishPageConfig[] = [
  page(SPANISH_BLOG_POSTS[0].path, SPANISH_BLOG_POSTS[0].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[0].title,
    metaDescription: SPANISH_BLOG_POSTS[0].description,
    h1: SPANISH_BLOG_POSTS[0].title,
    lede: 'Todo programa ya contiene el semestre completo; el problema es que llega como un PDF de texto corrido y no como un calendario con el que puedas decidir qué hacer esta semana.',
    intro: [
      'Sin importar la materia, el programa trae siempre las mismas tres cosas: cuándo se reúne la clase, cómo se calcula la calificación y cada elemento que te van a evaluar. Lo único que cambia de un documento a otro es el orden y el formato en que aparecen.',
      'El cuello de botella no es dónde guardar esa información. Cualquier calendario aguanta sin problema todas las fechas de un semestre. El trabajo real es sacarlas del documento sin que se pierda ninguna y sostener el calendario cuando el profesor mueva algo a mitad de semestre.',
      'Abajo está el método manual, paso a paso, con los formatos que hacen que se te escape una entrega. Al final, cómo el escaneo de programas de Semora hace lo mismo en una sola pasada.',
    ],
    sections: [
      {
        heading: 'Paso 1: lee el programa completo antes de anotar la primera fecha',
        paragraphs: [
          'La tentación es abrir el PDF y empezar a copiar fechas de inmediato. Vale la pena resistirla. Las políticas de evaluación, las reglas para entregas tardías y el formato de los exámenes suelen explicarse una sola vez, casi siempre en las primeras páginas, y después el documento apenas las menciona de pasada. Si te saltas ese contexto, una fecha suelta puede engañarte: lo que aparece como “entrega del proyecto” a veces es solo la propuesta, y el trabajo de verdad se entrega semanas después.',
          'Esa primera lectura también sirve para detectar las reglas particulares de la materia: un profesor que elimina la nota más baja de los cuestionarios, una política de participación amarrada a la asistencia, una penalización fija por cada día de retraso. Nada de eso es una fecha, pero todo eso cambia la manera en que vas a tratar las fechas una vez que las tengas anotadas.',
          'Y cambia decisiones concretas más adelante. Si la materia elimina la nota más baja de los cuestionarios, un cuestionario que cae la misma semana que un parcial deja de ser urgente. Si las entregas tardías pierden una penalización fija por cada día de retraso, entregar tarde un trabajo de poco peso sale más barato que entregar tarde el que define la calificación del semestre. Sin esa lectura previa, las dos fechas se ven idénticas en la cuadrícula y la decisión se toma a ciegas.',
        ],
      },
      {
        heading: 'Paso 2: anota primero lo que se repite todo el semestre',
        paragraphs: [
          'Antes de meterte con las tareas individuales, captura la estructura que no cambia de una semana a otra. Son cuatro datos y se sacan rápido.',
          'Esa estructura es lo que convierte una lista de fechas en un calendario. Es la diferencia entre saber que hay “un ensayo el 14 de octubre” y saber que ese ensayo vale el 15 % de tu calificación en una materia que se reúne martes y jueves a las 11 de la mañana. Lo primero te avisa; lo segundo te deja decidir cuántos días le vas a dedicar.',
          'Los horarios de clase merecen entrar al calendario aunque te los sepas de memoria. Son los que definen qué huecos te quedan libres entre una materia y otra, y son también los que después te permiten traducir una frase como “se entrega al inicio de la clase 14” a un día concreto. Las fechas de inicio y de fin del semestre cumplen la misma función: sin ellas, “semana 6” es una etiqueta que no apunta a ningún día del calendario.',
        ],
        bullets: [
          'Días y horas en que se reúne la clase',
          'Horario de atención del profesor',
          'Fechas de inicio y de fin del semestre',
          'La escala de calificación o el peso de cada categoría: por ejemplo, tareas 20 %, parciales 30 %, examen final 30 % y participación 20 %',
        ],
      },
      {
        heading: 'Paso 3: convierte cada elemento evaluado en una fecha concreta',
        paragraphs: [
          'Recorre el documento por secciones y anota cada tarea, cuestionario, examen, proyecto y lectura obligatoria con su fecha de entrega. Los programas no presentan las fechas de la misma forma: unos dan un día exacto, otros dicen “el viernes anterior al receso” y otros remiten a un cronograma que avanza según el ritmo del curso.',
          'La parte que casi todo el mundo pospone es resolver esas referencias en el momento. Traduce cada una a una fecha real del calendario mientras la estás anotando, en lugar de dejar una nota para interpretar después. En octubre esa nota va a significar algo distinto de lo que significaba en agosto, y para entonces ya no vas a tener el programa abierto al lado.',
          'Resolverla en el momento es un gesto pequeño y muy mecánico. Si el programa dice “el viernes anterior al receso”, abres el calendario académico de tu institución, buscas el primer día del receso, retrocedes hasta el viernes que lo antecede y anotas ese día como fecha de entrega, con el nombre del trabajo. Al lado dejas escrito de dónde salió la fecha. Si el receso se mueve, sabes exactamente qué entrada hay que corregir y no rehaces el razonamiento desde cero.',
          'Junto a cada elemento anota también el tipo y la ponderación cuando el documento la dé. Una fecha sin peso te dice cuándo, pero no cuánto importa, y esas dos preguntas se responden juntas o no se responden.',
        ],
      },
      {
        heading: 'Cuatro formatos que hacen que se te escape algo',
        paragraphs: [
          'Hay patrones que aparecen lo suficiente como para nombrarlos, porque son los que dejan un calendario con aspecto de completo cuando en realidad le faltan entradas.',
        ],
        bullets: [
          '“Por definir” o “se anunciará en la plataforma”. Algunos programas dejan a propósito sin fijar la fecha de un examen o de un proyecto. Crea el elemento de todas formas y márcalo como pendiente: un elemento que falta en silencio es mucho peor que uno que aparece sin fecha.',
          'Entregas recurrentes. “Reporte de lectura cada viernes antes de las 11:59 p. m.” es una línea del programa y son entre 12 y 15 fechas reales en el semestre. Hay que expandirlas una por una, no dejarlas como un recordatorio genérico que tú tienes que acordarte de aplicar cada semana.',
          'Laboratorios, monitorías y ayudantías con cronograma aparte. En materias con muchos estudiantes es común que te entreguen un segundo documento —un manual de laboratorio o el cronograma de la monitoría— con entregas que no aparecen en el programa principal. Si tu materia tiene sesión práctica, pregunta si tiene su propio cronograma.',
          'Fechas relativas a la sesión de clase. “Se entrega al inicio de la clase 14” no significa nada hasta que numeres las sesiones sobre el calendario, y para eso necesitas los días de reunión y los feriados en que no hay clase.',
        ],
      },
      {
        heading: 'Paso 4: un calendario, no una lista',
        paragraphs: [
          'Una lista se lee de arriba abajo y no te dice nada sobre la carga. Una vista de semana o de mes sí: ahí es donde se ve que tres exámenes van a caer en la misma semana, y se ve con anticipación, que es justo cuando aún estás a tiempo de mover algo.',
          'La diferencia es puramente visual, y por eso funciona. La lista ordena por fecha, pero no muestra el espacio que hay entre una fecha y la siguiente. En una cuadrícula de mes, una semana cargada de entregas se ve distinta de una semana tranquila, aunque en la lista ocupen renglones idénticos. Ese contraste es la información que usas para decidir qué adelantas.',
          'Incluye también las horas de clase, no solo las entregas. Un hueco entre dos materias es tiempo de estudio real; un hueco que en realidad choca con el laboratorio no lo es. Cuando el calendario reúne las dos capas, planear la semana deja de ser un cálculo mental que rehaces cada domingo.',
        ],
      },
      {
        heading: 'Paso 5: repite con cada materia y luego míralas juntas',
        paragraphs: [
          'Una materia sola casi nunca se ve pesada. Cuatro apiladas en la misma semana, sí. Y el choque no está escrito en ningún programa: aparece solamente cuando los cuatro cronogramas comparten la misma vista.',
          'Por eso el paso final no es “terminar la última materia”, sino mirar el semestre entero de una vez y marcar las semanas críticas: aquellas en las que se juntan varias entregas de peso alto o un parcial con una entrega grande. Son las semanas en las que vas a querer haber empezado con anticipación, y la única forma de saber cuáles son es verlas antes de que lleguen. Descubrir el choque la noche anterior no te deja ninguna opción; descubrirlo en la primera semana te deja varias.',
        ],
      },
      {
        heading: 'Un ejemplo: tres oraciones, quince fechas',
        paragraphs: [
          'Supón que el programa de un curso introductorio de estadística dice esto: “Los talleres semanales se entregan cada miércoles a las 5:00 p. m., a partir de la semana 2. Habrá dos parciales (semanas 6 y 11) y un examen final acumulativo durante la semana de finales. Evaluación: talleres 20 %, cada parcial 20 %, examen final 40 %”.',
          'Son cuatro categorías y alrededor de quince fechas individuales, extraídas de tres oraciones. Multiplícalo por cuatro o cinco materias y queda claro por qué mucha gente empieza el ejercicio y no lo termina, y por qué quien lo termina rara vez vuelve a actualizarlo.',
          'Fíjate en que ninguna de las operaciones que exige ese párrafo es difícil por separado. Lo que cuesta es hacerlas todas sin saltarse ninguna, con el programa abierto al lado, y volver a hacerlas cada vez que algo se mueve. El error típico tampoco es equivocarse en un día: es dejar la línea de los talleres sin expandir y descubrir avanzado el semestre que el calendario nunca tuvo buena parte de las entregas de esa materia.',
        ],
        bullets: [
          'Expandir la línea de los talleres en entradas individuales de miércoles a las 5:00 p. m., desde la semana 2 hasta la última semana de clases regulares, y no dejarla como un aviso suelto de “talleres semanales”.',
          'Convertir “semana 6” y “semana 11” en fechas reales, contando desde el inicio del semestre y descontando las semanas sin clase.',
          'Marcar el examen final como pendiente si el programa todavía no da un día exacto: el cronograma de finales casi siempre se publica aparte y a mitad del semestre.',
          'Registrar las ponderaciones (20/20/20/40) junto a cada categoría y no solo las fechas, porque es lo que después te permite calcular qué necesitas sacar en el final.',
        ],
      },
      {
        heading: 'El calendario tiene que aguantar los cambios',
        paragraphs: [
          'El programa es una foto de la primera semana de clases, y los profesores mueven fechas: un parcial se corre, una lectura se reemplaza, una entrega se desplaza por un feriado o por un día sin clases. Cualquier sistema que sostenga tu calendario necesita absorber eso sin obligarte a revisar entrada por entrada otra vez.',
          'Conviene además guardar el programa original en lugar de descartarlo una vez vaciado en el calendario. Cuando una fecha cambia, la pregunta que aparece casi siempre es qué decía el documento antes, y esa es la única respuesta que no depende de tu memoria ni de lo que recuerde el compañero de al lado.',
        ],
        bullets: [
          'Si trabajas en papel o en una hoja de cálculo, tacha y reescribe solo la entrada que cambió, y anota el día en que hiciste el cambio. Si alguna vez hay una discusión sobre cuál versión estaba vigente, tienes un registro.',
          'Si tu institución usa una plataforma académica como Canvas, los cambios de fecha suelen propagarse solos a quien esté sincronizado. Esa es la ventaja concreta de conectar la materia a la plataforma en vez de depender únicamente de un escaneo hecho una sola vez.',
          'Vuelve sobre cada “por definir” cada cierto tiempo. Los profesores no siempre publican un anuncio dedicado cuando por fin le ponen fecha a algo que habían dejado abierto.',
        ],
      },
      {
        heading: '¿Y si simplemente uso el calendario del teléfono?',
        paragraphs: [
          'Hay que reconocerlo: el calendario que ya viene en tu teléfono guarda sin ningún problema todas las fechas de las que venimos hablando. El límite nunca fue el almacenamiento. El límite es el trabajo de pasar el programa a ese formato y, sobre todo, el de mantenerlo ahí cuando las cosas se mueven a mitad de semestre.',
          'Hay una segunda diferencia, menos obvia. Un calendario genérico no tiene idea de qué es una ponderación. “Ensayo 2” y “Examen final” se ven exactamente iguales en la cuadrícula, aunque uno pese diez veces más en tu calificación. Y cuando dos cosas caen el mismo día y tienes que decidir a cuál le dedicas lo que queda de la noche, el calendario no te ayuda a decidir: solo te recuerda que las dos existen.',
        ],
      },
      {
        heading: 'Cómo Semora hace todo esto en una sola pasada',
        paragraphs: [
          'Ese proceso completo de cinco pasos es lo que hace el escaneo de programas de Semora. Puedes importar el programa con una foto (varias páginas, hasta 5), subirlo como PDF, arrastrarlo en la versión web o pegar el texto que copiaste del archivo o de la página de tu plataforma académica. OpenAI GPT-5.6 Luna lo lee y extrae el nombre del curso, el profesor, los horarios de clase, el horario de atención, las fechas del semestre, la escala de calificación y cada tarea, examen, cuestionario, proyecto y lectura con su fecha de entrega. Todo eso llena el calendario, la lista de tareas y el seguimiento de calificaciones al mismo tiempo, y nada se guarda hasta que lo revisas en pantalla.',
          'Esa pantalla de revisión existe justamente por los formatos raros del paso 3. El escaneo hereda las mismas ambigüedades que te complican la vida a mano: si el programa dejó un examen sin día, lo verás señalado como pendiente en vez de convertido en una fecha inventada, y si una entrega recurrente quedó corta, la corriges antes de que entre al calendario y no después de haberla dado por buena.',
          'El plan Gratis incluye 5 escaneos de programas al mes y hasta 4 cursos por semestre, con seguimiento completo de entregas y calificaciones, además de recordatorios el mismo día. La sincronización con el calendario del dispositivo y la exportación .ics forman parte de Pro, que cuesta $3.99 al mes o $19.99 al año y se compra dentro de la app.',
          'Si tu institución usa Canvas, puedes conectarlo además con un token de acceso personal que generas tú mismo dentro de Canvas, sin esperar ninguna revisión de OAuth. Así las tareas de Canvas y los datos que solo están en el programa —horario de atención, ponderaciones, horarios de clase— quedan en la misma vista, y las fechas se actualizan cuando el profesor las cambia del lado de Canvas.',
        ],
      },
    ],
    faq: [
      { question: '¿Cuánto me va a tomar pasar un programa al calendario a mano?', answer: 'Depende mucho del documento. Un programa con una tabla limpia de fechas se pasa rápido; uno con entregas recurrentes, laboratorio aparte y fechas relativas a la sesión de clase toma bastante más, porque cada línea hay que resolverla con el calendario académico en la mano antes de poder anotarla. De todos modos, la primera pasada casi nunca es lo que falla: lo que falla es el mantenimiento a mitad de semestre, cuando el documento ya está cerrado y las fechas empiezan a moverse.' },
      { question: '¿Qué hago con una fecha “por definir”?', answer: 'Crea el elemento igual, sin inventarle fecha, y márcalo como pendiente para revisarlo más adelante. Un examen sin fecha sigue necesitando seguimiento, y es preferible ver un pendiente en la lista a que el examen simplemente no exista en tu calendario. Ponerle una fecha tentativa es peor que dejarlo pendiente: en cuanto la olvidas, la tentativa se comporta como si fuera oficial.' },
      { question: '¿Debo poner las lecturas en el calendario?', answer: 'Sí, cuando tienen fecha de discusión, prueba o entrega asociada. Las lecturas abiertas, sin fecha fija, funcionan mejor como tareas sin hora exacta, para que no compitan visualmente con las entregas que sí tienen consecuencias en la calificación.' },
      { question: 'Si el programa y la plataforma del curso no coinciden, ¿cuál manda?', answer: 'Manda la fuente oficial más reciente, que en la práctica suele ser el anuncio o la plataforma, no el PDF de la primera semana. Cuando cambies una fecha, deja anotado de dónde salió el cambio: así no terminas con dos versiones de la misma tarea sin saber cuál es la buena.' },
      { question: '¿Sirve escanear el programa si mi materia ya está conectada a Canvas?', answer: 'Sí, porque no traen lo mismo. Canvas trae las tareas y sus fechas; el horario de atención, los horarios de clase, la escala de calificación y las ponderaciones normalmente solo están en el programa. Con las dos fuentes juntas tienes las fechas actualizadas y el contexto que explica cuánto pesa cada una.' },
      { question: '¿Necesito Pro para organizar el semestre así?', answer: 'No. Con el plan Gratis puedes escanear hasta 5 programas al mes y llevar hasta 4 cursos por semestre, con seguimiento de entregas y calificaciones, además de recordatorios el mismo día. Pro suma la sincronización con el calendario del dispositivo y la exportación .ics, y cuesta $3.99 al mes o $19.99 al año dentro de la app.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[1].path, SPANISH_BLOG_POSTS[1].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[1].title,
    metaDescription: SPANISH_BLOG_POSTS[1].description,
    h1: SPANISH_BLOG_POSTS[1].title,
    lede: 'Casi toda la confusión con el promedio ponderado nace de mezclar tres números distintos: aquí aislamos uno y lo calculamos hasta el último decimal.',
    intro: [
      'En Estados Unidos, «GPA ponderado» suele referirse a las escalas que suman puntos extra por cursos de honores o de nivel avanzado, donde una A puede valer 5.0 en lugar de 4.0. Ese sistema depende por completo de cada institución —cuánto suma, a qué materias se aplica y si aparece o no en el expediente— y ninguna fórmula lo resuelve. Eso se pregunta en la oficina de registro académico, y no es el tema de este artículo.',
      'El tema es el cálculo que sí haces tú, casi todas las semanas, aunque no lo llames así: la calificación que llevas dentro de una sola materia cuando el programa reparte el puntaje entre tareas, parciales, participación y examen final. Las categorías no valen lo mismo, y hacer bien o mal la cuenta puede significar varios puntos de diferencia justo en la frontera entre una letra y otra.',
      'Vale la pena adelantar desde ahora la tercera confusión: la calificación de un curso, el GPA del semestre y el GPA acumulado son tres números distintos que se calculan de tres maneras distintas. Los separamos al final, con la tabla de conversión y un ejemplo con créditos.',
    ],
    sections: [
      {
        heading: 'La fórmula, y el detalle que decide todo',
        paragraphs: [
          'El cálculo cabe en una línea: promedio ponderado = (suma de la calificación de cada categoría multiplicada por su peso) ÷ (suma de los pesos que ya tienen trabajo calificado). El numerador es la parte obvia. El denominador es el que se presta a confusión.',
          'Ese denominador no es 100. Es la suma de los pesos de las categorías que ya te calificaron. Si el examen final vale 30 % y todavía no lo presentas, esos 30 puntos de peso no entran en ninguno de los dos lados de la división. No cuentan como cero: simplemente todavía no existen para el cálculo. Por lo mismo, un programa cuyos pesos no suman 100 —porque hay puntos extra o porque quedó un margen sin asignar— no rompe nada.',
          'Es una distinción práctica, no un tecnicismo. Si metieras el final en el denominador antes de presentarlo, en la tercera semana de clases arrastrarías porcentajes bajísimos en todas tus materias y sin forma de saber si vas bien o mal. El número que te interesa a mitad de semestre responde algo más modesto: con lo que ya está evaluado, ¿en qué punto estoy? Cada calificación nueva reescribe esa respuesta.',
        ],
      },
      {
        heading: 'Ejemplo 1: cuatro categorías, dos calificadas',
        paragraphs: [
          'Imagina un curso repartido así: tareas 20 %, parcial 30 %, examen final 30 % y participación 20 %. Vas en la quinta semana del semestre. Llevas un promedio de 92 % en las tareas entregadas y sacaste 85 % en el parcial. La participación aún no se asigna y el final llega al cierre del semestre.',
          'Solo entran las dos categorías calificadas. Multiplica cada calificación por su peso: 92 × 20 = 1840 y 85 × 30 = 2550. Suma: 1840 + 2550 = 4390. Divide entre la suma de esos pesos, que es 20 + 30 = 50. El resultado es 4390 ÷ 50 = 87.8 %.',
          'Los otros 50 puntos de peso —participación y final— quedan fuera por completo. Y esto importa: 87.8 % no es tu calificación final ni una predicción de ella; es el estado actual de la mitad del curso que ya se evaluó. La otra mitad del curso está intacta.',
        ],
      },
      {
        heading: 'Ejemplo 2: la calificación sube sin que cambie nada anterior',
        paragraphs: [
          'Sigue el mismo curso. En la semana diez el profesor publica la participación: 98 %, con peso 20. Nada más cambió: las tareas siguen en 92 % y el parcial en 85 %.',
          'Rehaz la cuenta con tres categorías: (92 × 20) + (85 × 30) + (98 × 20) = 1840 + 2550 + 1960 = 6350. El denominador ahora es 20 + 30 + 20 = 70. Entonces 6350 ÷ 70 = 90.7 %.',
          'Subiste casi tres puntos sin haber mejorado ninguna calificación previa. La razón es aritmética: entró una calificación alta con un peso considerable, y el numerador creció proporcionalmente más que el denominador. Funciona igual en el otro sentido: una categoría floja que aparece tarde puede bajarte varios puntos en un solo día sin que hayas hecho nada distinto.',
          'Conviene revisar el promedio cuando se publica una categoría completa, no cada vez que sale una tarea suelta: los movimientos grandes vienen de las categorías, no de los elementos individuales.',
        ],
      },
      {
        heading: 'Por qué un promedio simple da otro número',
        paragraphs: [
          'Alguien podría promediar 92, 85 y 98 sin más: 275 ÷ 3 = 91.7 %. Está a un punto del 90.7 % real, lo bastante cerca como para parecer aceptable y lo bastante lejos como para cruzar el umbral entre dos letras en el momento equivocado.',
          'La distancia entre los dos métodos crece rápido cuando los pesos son muy desiguales. El promedio simple le da la misma influencia a una prueba corta de 5 % que a un examen final de 35 %, aunque el segundo determine siete veces más de tu calificación. Arriba los pesos se parecían y la brecha se quedó en un punto; con un examen que por sí solo vale un tercio del curso, el promedio simple deja de aproximarse.',
          'La regla es sencilla: promedia sin pesos solo dentro de una categoría, donde los elementos sí son equivalentes entre sí. En cuanto combines categorías distintas, cada una tiene que entrar con su peso.',
        ],
      },
      {
        heading: 'Ejemplo 3: un curso que elimina la calificación más baja',
        paragraphs: [
          'Ahora un caso realista. El programa dice: pruebas cortas 15 % (se elimina la más baja de seis), tareas 15 %, primer parcial 15 %, segundo parcial 20 %, examen final 35 %.',
          'Tus seis pruebas cortas: 88, 95, 72, 90, 85 y 91. La eliminación se aplica primero, dentro de la categoría, antes de sacar cualquier promedio. Fuera el 72. Quedan cinco: 88 + 95 + 90 + 85 + 91 = 449, y 449 ÷ 5 = 89.8 %. Ese es el número que entra al cálculo general.',
          'Supón además un promedio de 94 % en tareas y un 81 % en el primer parcial. El segundo parcial y el final —55 puntos de peso combinados— todavía no existen. Entonces: (89.8 × 15) + (94 × 15) + (81 × 15) = 1347 + 1410 + 1215 = 3972, dividido entre 15 + 15 + 15 = 45. Resultado: 3972 ÷ 45 = 88.3 %.',
          'Fíjate en que las tres categorías que ya cuentan pesan lo mismo, así que aquí el ponderado coincide con un promedio simple de las tres. Es una coincidencia del momento: en cuanto entre el segundo parcial con su 20 %, deja de cumplirse.',
        ],
      },
      {
        heading: 'El orden del descarte cambia el resultado',
        paragraphs: [
          'El error más caro con las reglas de eliminación no es olvidarlas, sino aplicarlas en el momento equivocado. Es tentador promediar las seis pruebas y después «compensar» la más baja en algún punto del cálculo general.',
          'Si promedias las seis: 88 + 95 + 72 + 90 + 85 + 91 = 521, y 521 ÷ 6 = 86.8 %. Son tres puntos enteros por debajo del 89.8 % correcto, porque el 72 arrastra hacia abajo un grupo pequeño de calificaciones. Al meter ese 86.8 % en la misma fórmula ponderada, (86.8 × 15) + (94 × 15) + (81 × 15) = 3927, y 3927 ÷ 45 = 87.3 % en lugar de 88.3 %.',
          'Un punto entero de diferencia, sin ninguna calificación distinta y sin ningún error de multiplicación: solo por el orden. La regla se resume así: el descarte ocurre dentro de la categoría y antes del promedio de esa categoría; nunca se le aplica al promedio ponderado ya terminado. Y si el programa elimina la más baja de dos categorías diferentes, cada una descarta la suya por separado.',
        ],
      },
      {
        heading: 'Qué significa realmente un 89.5 %',
        paragraphs: [
          'En muchos cursos estadounidenses, un 89.5 % se redondea a 90, y 90 suele ser la frontera de la A−. Es el redondeo aritmético común, pero es una decisión del profesor, no una ley del sistema. Tres cosas varían de un curso a otro.',
          'Primero, si se redondea: hay profesores que toman un 89.49 % como B+ y ahí termina la discusión. Segundo, cuándo se redondea: no es lo mismo redondear una sola vez al final que redondear después de cada tarea, y con una docena de trabajos evaluados o más esos redondeos pequeños se acumulan en cualquiera de las dos direcciones. Tercero, dónde están los umbrales: el esquema 90/80/70/60 es frecuente, pero hay cursos que colocan la A más arriba y otros que usan rangos desiguales en lugar de bandas de la misma anchura.',
          'Ninguna de esas tres preguntas se responde con aritmética. Se responden leyendo el programa y, si el programa no lo dice, escribiendo un correo. Mejor preguntarlo a mitad de semestre que descubrir en la última semana que tu 89.4 % nunca iba a convertirse en 90.',
        ],
      },
      {
        heading: 'Tres números distintos: curso, semestre y acumulado',
        paragraphs: [
          'El primero es el promedio ponderado de una materia: los 87.8 %, 90.7 % y 88.3 % de arriba. Es una calificación de curso, no un GPA, aunque a mitad de semestre se usen como sinónimos.',
          'El segundo es el GPA del semestre. Sale de las letras finales convertidas a puntos en una escala de 4.0: A = 4.0, A− = 3.7, B+ = 3.3, B = 3.0, B− = 2.7, C+ = 2.3, C = 2.0, C− = 1.7, D+ = 1.3, D = 1.0, D− = 0.7 y F = 0.0. Algunas instituciones no usan los signos + y −. Multiplicas los puntos de cada curso por sus créditos, sumas y divides entre el total de créditos. Con una A− en un curso de 4 créditos y una B en uno de 3: (3.7 × 4) + (3.0 × 3) = 14.8 + 9 = 23.8, y 23.8 ÷ 7 = 3.4.',
          'El tercero es el GPA acumulado: la misma cuenta por créditos, pero sobre todos los semestres cursados. Es el número del expediente oficial y el que aparece en solicitudes de posgrado, becas e intercambios. Fíjate en que los tres usan pesos, pero pesos de naturaleza distinta: porcentajes del programa en el primero, créditos en los otros dos. Mezclarlos produce resultados que no significan nada.',
        ],
      },
      {
        heading: 'Cuando el programa no dice cuánto pesa cada cosa',
        paragraphs: [
          'No todos los programas traen una tabla de porcentajes. Muchos entierran los criterios de evaluación en un párrafo de «Políticas del curso», y es facilísimo saltarse una frase como «las tareas representarán una parte importante de la calificación» sin darte cuenta de que ahí no hay ningún número.',
          'Cuatro cosas que conviene hacer antes de anotar la primera calificación:',
        ],
        bullets: [
          'No supongas que todas las categorías pesan igual. Es la suposición automática y suele estar equivocada; peor aún, el error se agranda con cada calificación nueva que sumas al cálculo.',
          'Escribe al profesor o revisa la página del curso en la plataforma antes de tratar una ponderación adivinada como si fuera un dato. Es una pregunta de una línea frente a un semestre entero de promedio equivocado.',
          'Aprovecha para preguntar los casos límite: si hay puntos extra y cómo se aplican, si una tarea eliminada cambia el denominador, y cómo cuenta un trabajo entregado tarde o incompleto.',
          'Actualiza tus registros el mismo día si las ponderaciones cambian a mitad del semestre. Pasa más de lo que uno espera, sobre todo cuando se cancela una evaluación y su peso se reparte entre las demás.',
        ],
      },
      {
        heading: 'Cómo hacerlo sin hacer las cuentas',
        paragraphs: [
          'Todo lo anterior cabe en una hoja de cálculo, y funciona. El problema no es la aritmética sino el mantenimiento: cuatro o cinco materias, cada una con sus categorías, sus reglas de descarte y sus cambios a mitad del semestre.',
          'Semora extrae los criterios de evaluación de cada materia durante el escaneo del programa y después calcula el promedio ponderado a medida que anotas calificaciones, contando solo lo que ya está evaluado. Es la lógica de los ejemplos de arriba, incluido el denominador que solo crece cuando una categoría recibe su primera calificación.',
          'En la pestaña de Cursos aparece además una estimación del GPA del semestre: convierte la calificación de cada curso a puntos, la pondera por créditos y te indica cuántos de tus cursos llevan suficiente trabajo calificado para contar. Lo que Semora no hace es el GPA acumulado, porque exige las letras finales y los créditos de todos tus semestres anteriores, y esos datos viven en el sistema de tu institución.',
          'El seguimiento de calificaciones viene en el plan Gratis, que incluye cinco escaneos de programas al mes y hasta cuatro cursos por semestre.',
          'Pro cuesta $3.99 al mes o $19.99 al año y agrega pronósticos de calificaciones, el simulador de escenarios «¿qué pasa si…?», tendencias de progreso, exportación CSV, vista para imprimir en la web y alertas de riesgo académico. También permite editar la escala de calificaciones en Ajustes. La misma cuenta funciona en iPhone y en la web.',
        ],
      },
    ],
    faq: [
      { question: '¿Una tarea que todavía no me califican cuenta como cero?', answer: 'No, y esa es la parte más importante de la fórmula. El peso de una categoría entra al denominador únicamente cuando esa categoría ya tiene trabajo evaluado: un examen final de 30 % que aún no presentas no aparece por ningún lado del cálculo. Distinto es un trabajo que no entregaste y el profesor calificó con cero: eso sí es una calificación real y entra al promedio de su categoría como cualquier otra.' },
      { question: '¿Cómo calculo qué necesito en el examen final?', answer: 'Plantéalo como una ecuación. Con el curso del segundo ejemplo llevas 6350 puntos acumulados y el final vale 30, así que el total sería (6350 + la calificación del final × 30) ÷ 100. Si quieres terminar en 90, necesitas 9000 puntos: 9000 − 6350 = 2650, y 2650 ÷ 30 = 88.3 %. Ese es tu objetivo.' },
      { question: '¿Qué hago si el profesor cambia las ponderaciones a mitad del semestre?', answer: 'Actualiza los pesos y vuelve a calcular con las calificaciones que ya tienes; no hay que rehacer nada más. El resultado va a moverse, a veces bastante, porque cambió el peso relativo de lo que ya está evaluado. Guarda el anuncio o el correo donde se comunicó el cambio, por si después hay una discrepancia.' },
      { question: '¿Puedo promediar las calificaciones en letra en lugar de los porcentajes?', answer: 'No conviene. Las letras cubren rangos, así que un 90 % y un 99 % son la misma A y promediarlas descarta la diferencia. Trabaja con porcentajes mientras el semestre esté en curso y usa las letras solo al final, cuando ya son definitivas y las conviertes a puntos para el GPA.' },
      { question: '¿Semora calcula mi GPA acumulado?', answer: 'No. Calcula el promedio ponderado de cada curso y una estimación del GPA del semestre en la pestaña de Cursos, ambos en el plan Gratis. El acumulado requiere las letras y los créditos de todos los semestres que ya cursaste, y esa información sale del expediente oficial de tu institución.' },
      { question: '¿Necesito Pro para llevar mis calificaciones?', answer: 'No. El seguimiento de calificaciones y la estimación del GPA del semestre están incluidos en el plan Gratis, junto con cinco escaneos de programas al mes y hasta cuatro cursos por semestre. Pro, a $3.99 al mes o $19.99 al año, agrega los pronósticos, el simulador de escenarios, las tendencias de progreso, la exportación CSV, la vista para imprimir y las alertas de riesgo académico.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[2].path, SPANISH_BLOG_POSTS[2].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[2].title,
    metaDescription: SPANISH_BLOG_POSTS[2].description,
    h1: SPANISH_BLOG_POSTS[2].title,
    lede: 'Cualquier método aguanta la segunda semana; la pregunta de fondo es quién copia las fechas del programa al calendario cada vez que un profesor mueve algo.',
    intro: [
      'Todo sistema para controlar entregas termina en la misma prueba: qué pasa cuando las tareas, los exámenes y las lecturas de cuatro cursos tienen que convivir en el mismo lugar. Un método que funciona con una sola materia en la segunda semana suele venirse abajo en la semana diez, cuando los cuestionarios, las guías de ejercicios, las entregas parciales de un proyecto y un par de parciales compiten por los mismos días.',
      'La diferencia entre una herramienta y otra casi nunca está en la cantidad de funciones. Está en quién convierte el programa de cada materia en fechas concretas: tú, línea por línea, cada vez que algo cambia, o la app. Ese reparto del esfuerzo decide si el sistema sigue vivo en noviembre.',
      'A continuación repasamos las opciones más comunes, las apps que atacan este problema, las cuatro preguntas con las que las medimos y una guía rápida para tu caso.',
    ],
    sections: [
      {
        heading: 'La agenda de papel: flexible, pero sin memoria',
        paragraphs: [
          'Una agenda o una hoja de cálculo funciona, y con pocas materias puede ser lo más rápido. El costo aparece después: cada fecha se transcribe a mano desde cada programa, y si el profesor adelanta una entrega, tú tienes que enterarte y volver a escribirla. Lo pesado no es el trabajo de la primera semana, sino el mantenimiento silencioso del resto del semestre.',
          'El otro problema es que el papel no relaciona nada: “Ensayo 2” y “Guía de ejercicios 6” se ven exactamente igual aunque uno valga diez veces más de la calificación final, y nada te advierte que una misma semana concentra un parcial, una exposición y una entrega de laboratorio. No es una mala decisión; solo conviene saber qué pagas por esa flexibilidad.',
        ],
      },
      {
        heading: 'Las apps de tareas genéricas quitan el papel, no el trabajo',
        paragraphs: [
          'Una app de listas como Recordatorios o Todoist guarda una fecha de entrega y una casilla, y lo hace bien. Lo que no puede es entender de dónde salió esa fecha: no sabe qué es un programa, no tiene noción de ponderación y no puede avisarte de que tres cursos acaban de poner evaluación la misma semana.',
          'Cargar un semestre entero ahí significa leer cada programa línea por línea y teclear cada fecha con su curso y su hora, y repetirlo cada vez que una fecha se corre. Es el mismo trabajo de la agenda de papel, ahora con notificaciones: la traducción del programa al calendario sigue de tu lado y se paga en la semana de más carga.',
        ],
      },
      {
        heading: 'Las cuatro preguntas con las que medimos',
        paragraphs: [
          'Las estrellas de la tienda y el texto promocional no predicen casi nada sobre cómo se comporta una app en la semana diez. Por eso sometimos estas herramientas a cuatro preguntas que sí distinguen una demostración bonita de un semestre completo de uso real.',
          'Semora, DormWay, Shovel y StudyFetch hacen alguna forma de escaneo del programa con IA. Mindgrasp y Studley AI procesan el material que subes, pero no extraen fechas de un programa; Taskade no lee documentos con ese fin y myHomework depende de la entrada manual o de la importación desde la plataforma de la universidad. En cuanto a calificaciones, solo Semora y DormWay les dan seguimiento; las demás no lo describen como función central confirmada.',
          'En la última pregunta la cobertura varía: Semora y StudyFetch trabajan en teléfono y navegador; DormWay y myHomework llegan a más sistemas operativos; Shovel y Taskade suman apps de iOS y Android a su versión web.',
        ],
        bullets: [
          '¿Lee el programa, o necesita una plataforma académica o entrada manual para tener las fechas?',
          '¿Incluye seguimiento de calificaciones, o solo una lista de entregas?',
          '¿El plan gratis es permanente, o es una versión recortada que deja de servir en cuanto sumas materias?',
          '¿Sincroniza teléfono y navegador con la misma cuenta y sin pasos extra?',
        ],
      },
      {
        heading: 'Semora: el programa como punto de partida',
        paragraphs: [
          'Semora escanea el programa desde una foto, un PDF, un archivo arrastrado o texto pegado, y extrae cada tarea, examen, cuestionario, proyecto y lectura con su fecha de entrega, además de la escala de calificaciones, los horarios y las horas de consulta. Entregas y calificaciones quedan en la misma pantalla y en el mismo plan.',
          'El plan Gratis incluye cinco escaneos de programa por mes calendario y hasta cuatro cursos en un semestre, y no caduca. La sincronización con tu calendario mediante exportación .ics es una función de Pro.',
          'Pro añade la importación de tareas desde Canvas, Blackboard y Moodle; en Canvas la conexión se hace con un token de acceso personal que generas tú mismo, sin depender de una revisión de OAuth.',
          'Es nuestro producto, así que léelo con eso en mente: hay situaciones en las que otra de estas apps te va a servir mejor, y las detallamos más abajo.',
        ],
      },
      {
        heading: 'DormWay: gratis, con tres plataformas académicas',
        paragraphs: [
          'DormWay combina escaneo del programa con IA y sincronización de solo lectura con Canvas, Blackboard y Moodle, y funde todo en una sola línea de tiempo del semestre. Hasta donde se puede verificar, es totalmente gratis: su sitio y su ficha en la App Store afirman que no hay muros de pago ni tarjeta de crédito.',
          'Incluye una calculadora de GPA y calificaciones con categorías ponderadas ajustables, un asistente con IA llamado “Ace” que responde preguntas sobre las políticas del curso citando el punto del programa de donde salió la respuesta, y una pestaña de “Intelligence” por curso con estimación de dificultad y horas semanales.',
          'Funciona en la web, iPhone, iPad y Mac. Según el blog de la propia DormWay, no hay app para Android, lo cual la descarta para buena parte de los estudiantes en América Latina.',
        ],
      },
      {
        heading: 'Shovel: el tiempo disponible como restricción',
        paragraphs: [
          'Shovel convierte un programa en PDF o una conexión con la plataforma de tu institución —Canvas, Brightspace, Moodle o Google Classroom— en un horario de estudio por bloques, y compara el tiempo que realmente tienes libre con el tiempo estimado que exige cada tarea. Otras apps te muestran lo que debes; esta te muestra si cabe.',
          'Suma estimadores de tiempo de lectura, seguimiento de rachas, cursos gratuitos sobre técnicas de estudio y “The Cushion™”, que anticipa conflictos antes de que ocurran. La sincronización con la plataforma académica se actualiza aproximadamente cada 24 horas, y tiene apps nativas de iOS y Android.',
          'Su página de precios indica $9.79 al mes —rebajado desde $19.99— y $39 al año. Otras fuentes citan cifras distintas, así que conviene revisar su página antes de suscribirte.',
        ],
      },
      {
        heading: 'StudyFetch: un tutor con IA que primero pide tu material',
        paragraphs: [
          'El escaneo del programa hacia el calendario es una función más dentro de una plataforma de estudio con IA articulada en torno a su tutor Spark.E, que responde únicamente a partir del material que tú subes —diapositivas, PDF, apuntes, fotos, video o audio— y no de internet abierto. Esa restricción es su mejor argumento: reduce las respuestas inventadas sobre temas que tu curso ni cubre.',
          'Alrededor de ese núcleo genera tarjetas de estudio, cuestionarios, simulacros de examen y resúmenes narrados en formato pódcast, y un asistente de clase en vivo convierte el audio en apuntes estructurados. Su integración LTI 1.3 con Canvas, Blackboard, Schoology, D2L Brightspace y Google Classroom se instala a nivel institucional: si tu universidad no la tiene contratada, no está disponible para ti.',
          'Sus precios circulan en sitios de reseñas externos y no están confirmados en su propia página: un plan gratis limitado a 10 conversaciones con Spark.E, 1 conjunto de estudio y 2 archivos; Base cerca de $7.99 al mes, Premium cerca de $11.99, paquete semestral de unos $49.99 y anual de unos $99.99.',
        ],
      },
      {
        heading: 'Mindgrasp y Studley AI: complementos, no reemplazos',
        paragraphs: [
          'Ninguna de las dos lee un programa para sacar fechas de entrega, y decirlo importa porque aparecen en las mismas búsquedas: sirven para convertir material en preguntas, no para saber qué debes entregar el jueves.',
          'Mindgrasp toma un PDF, DOCX, PowerPoint, audio, video de YouTube o artículo web —o graba una clase en vivo— y devuelve apuntes con IA, un resumen, tarjetas de estudio, un cuestionario y un chat de tutor sobre ese contenido. El nivel Scholar o Premium añade un “experto en matemáticas”. Declara compatibilidad con Canvas, Blackboard y Panopto, pero para importar archivos, no para leer fechas. Su sitio no publica precios; sitios externos reportan entre $5.99 y $10.99 al mes.',
          'Studley AI es parecido: subes PDF, diapositivas, videos de YouTube o una foto de apuntes escritos a mano, y genera tarjetas de estudio, cuestionarios de opción múltiple, ejercicios para completar y un tutor con IA; su función “Solve” explica paso a paso un ejercicio fotografiado. En sus materiales públicos no hay escaneo del programa ni integración académica. Según su ficha en la App Store, supera las 460,000 descargas y tiene 4.74 de 5 con más de 31,000 reseñas; la empresa afirma tener más de un millón de usuarios, cifra propia y no verificada. Su plan gratis permite un conjunto de estudio al día, y reseñas externas reportan un plan Unlimited de $12.88 al mes.',
        ],
      },
      {
        heading: 'Taskade y myHomework: los dos extremos opuestos',
        paragraphs: [
          'Taskade es un espacio de trabajo con IA de propósito general: siete vistas intercambiables del mismo proyecto (Lista, Tablero, Calendario, Tabla, Mapa Mental, Gantt y Organigrama). Está pensado para equipos, no para estudiantes: no hay un mecanismo nativo que lea el PDF de un programa y lo convierta en tareas con fecha, ni integraciones académicas. Su página de precios indica un plan gratis (1 usuario, 3 aplicaciones, créditos de IA por única vez), Pro a $10 al mes con facturación anual, Business a $25 y Max a $100.',
          'myHomework Student Planner está en el extremo contrario: registras cursos y fechas tú mismo, o importas tareas desde Canvas, D2L, Google Classroom, Blackboard, Schoology y otras plataformas, y la versión premium actualiza el planificador por sí sola cuando aparecen tareas nuevas. No lee programas ni por foto ni por PDF.',
          'Lo que sí tiene es alcance: iOS, Android, Mac, Windows, Chrome y Kindle Fire, más de 60 temas visuales, widgets y cursos con código de color. La versión base es gratuita con publicidad y la versión sin anuncios se reporta alrededor de $4.99 al año. El negocio de la empresa se desplazó hacia los pases digitales para escuelas básicas y medias, aunque el planificador sigue disponible y se actualizó por última vez a principios de 2025.',
        ],
      },
      {
        heading: 'Cuál te conviene según tu caso',
        paragraphs: [
          'Ninguna de estas apps es la mejor en abstracto; lo que sigue son las situaciones en las que cada una gana, ordenadas por el problema y no por la marca.',
        ],
        bullets: [
          'Si tu universidad usa Blackboard o Moodle, junto con Canvas o en lugar de Canvas: DormWay sincroniza las tres en una sola línea de tiempo y no cobra nada.',
          'Si quieres que la planificación por bloques —tiempo disponible frente a tiempo estimado por tarea— sea la función principal y no un accesorio: Shovel.',
          'Si buscas un tutor con IA que trabaje con tus grabaciones de clase, diapositivas y apuntes, y el escaneo del programa es secundario: StudyFetch.',
          'Si solo necesitas tarjetas de estudio, un cuestionario o apuntes a partir de un documento o una grabación, y no te hace falta calendario: Mindgrasp o Studley AI, según prefieras el solucionador de ejercicios por foto (Studley AI) o el experto en matemáticas del nivel superior (Mindgrasp).',
          'Si quieres un planificador ligero en muchas plataformas, incluidas Mac, Windows o Kindle Fire, sin escaneo con IA: myHomework Student Planner.',
          'Si en realidad estás coordinando un equipo o un proyecto fuera de tus materias: Taskade.',
          'Si quieres que el paso del programa al calendario se haga solo, con seguimiento de calificaciones en el mismo plan gratis: ese es el hueco que Semora intenta llenar.',
        ],
      },
      {
        heading: 'De dónde salen estos datos',
        paragraphs: [
          'Esta comparación se basa en lo que cada producto declara públicamente en su sitio, su página de precios y su ficha de tienda. No probamos cada app durante un semestre completo, y decirlo es más honesto que fingir una prueba de campo.',
          'Cuando un dato no está confirmado por la propia empresa lo señalamos: aplica a los precios de StudyFetch y Mindgrasp y a las cifras de usuarios de Studley AI. Confírmalos antes de suscribirte.',
        ],
      },
      {
        heading: 'Dónde encaja Semora',
        paragraphs: [
          'El plan Gratis de Semora incluye cinco escaneos de programa por mes calendario, hasta cuatro cursos en un semestre, seguimiento completo de fechas de entrega y calificaciones, y recordatorios el mismo día. Es la combinación que buscábamos al empezar esta lista: el programa convertido en calendario sin trabajo manual y las calificaciones en el mismo lugar.',
          'Semora Pro cuesta $3.99 al mes o $19.99 al año, se compra dentro de la app y quita el límite de cursos y de semestres, junto con el tope mensual de escaneos. Añade el Plan Inteligente, el panel de carga académica, la escala de calificaciones con pronóstico, la sincronización de calendario con exportación .ics, las tarjetas de estudio, el temporizador de concentración, el Tutor con IA, las alertas de riesgo académico, las estadísticas de progreso y las funciones de compartir y rachas.',
          'Funciona en iPhone y en la web con una sola cuenta: un cambio hecho en el teléfono aparece en el navegador casi de inmediato. Si vienes de una hoja de cálculo, el primer escaneo muestra la diferencia: el programa entra completo, con ponderaciones y horarios.',
        ],
      },
    ],
    faq: [
      { question: '¿Cuál es la mejor app si mi universidad no usa Canvas?', answer: 'Si tu institución usa Blackboard o Moodle, DormWay sincroniza esas dos además de Canvas sin costo. Si no permite ninguna conexión externa —algo común en América Latina—, queda el escaneo del programa: la información existe en el PDF aunque no haya API que la entregue.' },
      { question: '¿Vale la pena pagar por un planificador si ya uso Google Calendar?', answer: 'Depende de quién llene el calendario. Google Calendar guarda perfectamente una fecha, pero alguien tiene que escribirla, y no sabe que ese examen pesa mucho más que una tarea cualquiera. Si tu problema es la transcripción y el seguimiento de los cambios, ahí una herramienta que lee el programa cambia las cosas.' },
      { question: '¿Un escaneo automático se equivoca con las fechas?', answer: 'Puede equivocarse, sobre todo con tablas mal armadas, años heredados del semestre anterior y fechas escritas como “por anunciar”. Lo importante no es que la IA acierte siempre, sino que te muestre el resultado para revisarlo antes de guardarlo y que señale las dudas en lugar de inventar un dato.' },
      { question: '¿Cuántos cursos puedo llevar en el plan Gratis de Semora?', answer: 'Cuatro cursos en un semestre, con cinco escaneos de programa por mes calendario. Si llevas más materias, o si vas a escanear programas corregidos varias veces, ahí es donde Pro tiene sentido; si no, el plan Gratis no caduca.' },
      { question: '¿Necesito varias de estas apps a la vez?', answer: 'Es una combinación razonable: una app que controla fechas y calificaciones, y otra que genera material de estudio. Mindgrasp y Studley AI encajan ahí. Lo que rara vez funciona es tener dos calendarios de entregas en paralelo: al primer cambio de fecha uno queda desactualizado y dejas de confiar en los dos.' },
      { question: '¿Por qué una app de esta lista es gratis y otra cobra?', answer: 'Un producto sin plan de pago, como DormWay hoy, tiene que financiarse en algún momento, y eso puede significar cambios más adelante. Uno con precio publicado te dice desde el principio cuál es el trato. Revisa si el plan gratis que usas tiene un límite claro y permanente, o si depende de que la empresa siga decidiendo no cobrar.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[3].path, SPANISH_BLOG_POSTS[3].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[3].title,
    metaDescription: SPANISH_BLOG_POSTS[3].description,
    h1: SPANISH_BLOG_POSTS[3].title,
    lede: 'Canvas registra lo que tienes que entregar, pero rara vez te avisa cuando todavía queda tiempo para hacer algo al respecto.',
    intro: [
      'Una entrega no se pierde porque Canvas se haya quedado callado. Se pierde porque el aviso llegó la misma noche del vencimiento, o porque llegó dentro de un resumen semanal que se abrió cuando ya no había nada que decidir. La información estaba ahí. El momento no servía.',
      'Canvas está hecho para ser el registro oficial de un curso: aquí está la tarea, aquí está la fecha de entrega, aquí está la calificación. Ese trabajo lo hace bien. Lo que no hace es preguntarse si tú, con varias materias encima, alcanzaste a notar que una fecha se adelantó dos días. Sus preferencias de notificación se activan por categoría, no vienen encendidas por defecto y en ninguna parte de esa pantalla existe una casilla que diga «avísame tres días antes».',
      'La solución tampoco es abandonar Canvas ni encender todas las alertas hasta que el teléfono vibre sin parar. Primero conviene revisar la configuración que ya tienes, porque ahí suele estar la falla; después, sumar una capa que avise con anticipación y que sepa cuánto pesa cada entrega.',
    ],
    sections: [
      {
        heading: 'Por qué se te pasa una fecha aunque abras Canvas todos los días',
        paragraphs: [
          'Las causas son bastante concretas y ninguna es un error del sistema. Son consecuencias de cómo está diseñado Canvas: una plataforma que registra hechos de un curso a la vez.',
          'Ninguna de estas cosas se arregla revisando Canvas con más frecuencia. Puedes entrar a diario y seguir sin ver que la próxima semana concentra tres evaluaciones, porque esa vista no existe dentro de un curso individual. Lo que ves al abrir una materia es la lista de esa materia, sin nada que la compare con las de las demás.',
        ],
        bullets: [
          'Las preferencias de notificación son opcionales y se configuran por categoría, así que es común que la de fecha de entrega esté apagada sin que nadie te lo haya dicho.',
          'Los avisos responden a eventos: se disparan cuando algo ocurre, casi siempre cerca de la fecha o después de ella, no con días de anticipación.',
          'Cada curso vive aparte, de modo que la semana en la que se juntan un ensayo, un parcial y un informe de laboratorio no aparece en ningún lado.',
          'El aviso no dice cuánto vale la tarea, así que una entrega del 2 % y un ensayo del 30 % llegan al teléfono exactamente igual.',
        ],
      },
      {
        heading: 'Revisa la configuración antes de dar por hecho que Canvas falla',
        paragraphs: [
          'La falla más común no es un problema técnico: es una configuración que nunca se tocó. Vale la pena revisarla antes de salir a buscar otra herramienta.',
          'Dentro de Canvas, la ruta suele ser Cuenta y luego Notificaciones. La redacción y el orden cambian según la institución y según las actualizaciones que Canvas hace a su interfaz, así que tómalo como una referencia general y no como un mapa exacto.',
          'Cada categoría se controla por separado y suele ofrecer las mismas opciones de entrega: de inmediato, resumen diario, resumen semanal o nunca. Aquí está el detalle que suele pasarse por alto: un aviso que queda esperando dentro de un resumen semanal es, en la práctica, idéntico a no recibir ningún aviso. Llega cuando ya no cambia nada. Y como la pantalla no distingue entre lo urgente y lo trivial, puedes estar convencido de que «las notificaciones están activadas» mientras la categoría que de verdad importaba está puesta en nunca.',
          'Lo bueno es que esa pantalla pertenece a la cuenta, no a cada materia. Lo que configures se aplica a todos tus cursos actuales y a los que inscribas después. No es una tarea de cada semestre: se hace una vez y queda hecha.',
        ],
      },
      {
        heading: 'Qué categorías conviene priorizar',
        paragraphs: [
          'Las que suelen aparecer, con distintos nombres según la institución, son estas.',
          'Si vas a poner solo dos en «de inmediato», que sean Fecha de entrega y, si en tu universidad los profesores editan mucho las tareas después de publicarlas, Cambios en tareas. Son las dos que te informan de algo que no puedes deducir por tu cuenta: que la regla cambió después de que ya planeaste tu semana. El resto —anuncios, foros, avisos de entrega recibida— describe cosas que puedes revisar la próxima vez que abras la plataforma.',
          'Las calificaciones pueden ir en resumen diario sin problema. Una calificación publicada es información útil, pero no exige una reacción en los próximos minutos, y en un semestre normal genera muchísimo más volumen que los cambios de fecha: cada cuestionario, cada práctica, cada participación calificada.',
        ],
        bullets: [
          'Anuncios: lo que el profesor publica para todo el grupo.',
          'Calificaciones: cuando se publica o se modifica una calificación.',
          'Fecha de entrega: cuando se agrega o se cambia una fecha.',
          'Cambios en tareas: cuando se edita una tarea que ya estaba publicada.',
          'Entregas tardías o estado de la entrega.',
        ],
      },
      {
        heading: 'Encender todo en «de inmediato» no es la solución',
        paragraphs: [
          'Parece la respuesta obvia y es justo ahí donde falla. Con cinco o seis materias, poner todas las categorías en inmediato significa que el teléfono suena por cada calificación de un cuestionario, por cada corrección menor al programa de la materia y por cada respuesta en un foro de discusión.',
          'Después de unos días, todos esos avisos reciben el mismo trato: medio segundo de vistazo y un deslizamiento del dedo para descartarlos. El problema es que el aviso que sí importaba —una fecha de entrega que se movió dos días hacia adelante— recibe exactamente el mismo medio segundo. No lo ignoras por descuido, sino porque aprendiste, con razón, que esas vibraciones rara vez requieren algo de ti.',
          'Esto no es una particularidad de Canvas. Pasado cierto punto, cada alerta nueva compite con las anteriores por el mismo pedacito de atención, y el resultado es que todas valen menos. Un recordatorio bien colocado tres días antes rinde más que diez avisos del mismo día repartidos entre diez tareas distintas, porque llega cuando aún se puede reacomodar la semana.',
        ],
      },
      {
        heading: 'Por qué tres días cambian la decisión y la mañana de la entrega no',
        paragraphs: [
          'Un aviso que llega la mañana del día de entrega solo puede confirmar lo que ya sospechabas. No te devuelve la semana que pasaste sin tenerlo presente.',
          'Tres días antes, en cambio, todavía existen opciones reales: empezar la lectura, escribirle un correo al profesor para aclarar una duda sobre el formato, reorganizar un sábado que estaba a punto de llenarse con otra cosa. Ese margen es la diferencia entre entregar algo pensado y entregar algo que apenas alcanzó a existir.',
          'El valor de un recordatorio no está en la información que trae, sino en cuántas decisiones siguen disponibles cuando llega. Por eso conviene medir cualquier sistema de avisos con una sola pregunta: cuando suena, ¿queda margen para hacer algo distinto? Si la respuesta es no, el aviso no está mal escrito ni mal enviado; está mal ubicado en el tiempo.',
        ],
      },
      {
        heading: 'Lo que un aviso de Canvas no puede decirte',
        paragraphs: [
          'Canvas te puede decir que hay un ensayo el viernes. Lo que no te puede decir es que ese ensayo vale el 30 % de la calificación final en una materia en la que vienes con un promedio de B-, mientras que la guía de ejercicios que vence el mismo día en otra materia vale el 2 %.',
          'Uno de los dos merece que le dediques el sábado completo. El otro, francamente, no. Esa decisión la tomas tú con información que Canvas tiene repartida en pantallas distintas: la tarea está en un lado, la ponderación en el programa de la materia, tu promedio actual en otra pantalla, y la comparación entre materias no está en ninguno.',
          'La razón de fondo es de diseño. Las notificaciones de Canvas se armaron a partir de hechos —se publicó una tarea, se fijó una fecha, se ingresó una calificación— y no a partir de juicios sobre lo que esos hechos significan para tu semestre. La alternativa manual es abrir las páginas de todos tus cursos y armar la comparación tú mismo, semana tras semana, que es exactamente el trabajo que nadie sostiene.',
        ],
      },
      {
        heading: 'Ningún curso ve el calendario de los demás',
        paragraphs: [
          'El caso que realmente hace daño no es una sola fecha olvidada. Es la semana en la que el ensayo del viernes, un parcial de otra materia y un informe de laboratorio caen dentro de los mismos siete días.',
          'Cada uno de esos cursos, por separado, tiene un calendario perfectamente razonable. El profesor de literatura no sabe cuándo aplica su parcial el de estadística. El sistema de notificaciones de un curso tampoco puede asomarse al calendario de otro: no está pensado para eso.',
          'Esa semana se detecta con una sola condición: que todas las fechas vivan en la misma vista, ordenadas por tiempo y no por materia. Es la razón por la que copiar todo a un calendario propio se vuelve un reflejo cuando avanza el semestre. Funciona, pero solo mientras nadie cambie una fecha; en cuanto el profesor mueve la entrega en Canvas, tu copia queda desactualizada sin avisarte.',
        ],
      },
      {
        heading: 'Qué conviene sumarle a Canvas',
        paragraphs: [
          'La conexión con Canvas forma parte de Pro. Semora se conecta mediante un token de acceso personal que generas tú mismo desde la configuración de tu cuenta de Canvas y pegas en la app: no hay que esperar a que el área de sistemas apruebe una integración ni pasar por un permiso institucional.',
          'El plan Gratis incluye cinco escaneos de programas al mes y hasta cuatro cursos por semestre, además de tareas, fechas de entrega, calificaciones ponderadas y recordatorios el mismo día. Con eso puedes armar el semestre escaneando el programa de cada materia y comprobar cómo se comporta el sistema antes de decidir si quieres además la sincronización automática.',
          'Pro cuesta $3.99 al mes o $19.99 al año, se contrata desde la app y, junto con la conexión con Canvas, responde directamente a los límites anteriores: puedes elegir la anticipación del aviso —uno o tres días, se configura una vez y se aplica automáticamente a las entregas siguientes—, definir horas de silencio para que un recordatorio de las dos de la madrugada se mueva a un momento en el que puedas actuar, y recibir alertas de riesgo académico que señalan calificaciones a la baja, trabajo pendiente o semanas en las que se apilan varias materias, con pasos concretos de recuperación.',
          'Todo funciona en iPhone y en la web con la misma cuenta, y los recordatorios y las tareas se sincronizan casi al instante. En la práctica significa abrir Canvas desde la laptop en el salón y revisar los recordatorios desde el teléfono entre una clase y otra, sin volver a capturar nada. El historial de sincronización deja ver cuándo se revisó la plataforma por última vez.',
        ],
      },
      {
        heading: 'El programa trae el contexto que las tareas de Canvas no incluyen',
        paragraphs: [
          'Escanear el programa de la materia agrega justo lo que falta para tomar decisiones. Semora lee una foto, un PDF, un archivo que arrastres o texto pegado, y de ahí saca la escala de calificación del profesor, las fechas del semestre, las horas de atención y los horarios exactos de clase.',
          'Nada de eso aparece en una tarea de Canvas. La ponderación es la que convierte una lista de entregas en un orden de prioridades, y las horas de atención son la diferencia entre resolver una duda el martes y arrastrarla hasta el día de la entrega. La escala del profesor importa por el mismo motivo: saber dónde cae exactamente el límite entre una calificación y la siguiente cambia por completo cuánto vale la pena pelear por una tarea concreta.',
          'Visto en conjunto: Canvas para el día a día de las tareas, el escaneo del programa para la estructura que las rodea. Juntos dan una imagen más completa que cualquiera por separado, y ninguno de los dos hace el trabajo del otro. Canvas sigue siendo la fuente oficial de tu curso.',
        ],
      },
      {
        heading: 'Recordatorios más un hábito, no recordatorios en lugar de un hábito',
        paragraphs: [
          'Vale la pena ser honesto sobre qué resuelve un recordatorio y qué no. Sirve muy bien para rescatar lo que se te habría olvidado por completo: el trabajo que se asignó en la semana dos y se entrega en la once, o las horas de atención que solo existen un día en el que normalmente no tienes clase.',
          'Lo que no puede hacer es avisarte de algo que nadie registró. Los recordatorios se disparan sobre cosas que el sistema ya conoce, en un horario que alguien configuró de antemano. La acumulación lenta de tareas pequeñas, el tramo del semestre que se ve claramente más pesado que el resto, la entrega que conviene empezar hoy aunque todavía nada te lo esté pidiendo: eso solo aparece si abres el calendario y miras hacia adelante.',
          'Una vez por semana, o cada dos semanas, es suficiente. Un rato mirando el mes que viene hace algo que ninguna notificación puede hacer por ti: te muestra la forma del semestre en lugar de una fecha suelta. La combinación correcta es recordatorios más un hábito, no recordatorios en lugar de uno.',
        ],
      },
    ],
    faq: [
      { question: '¿Semora reemplaza las notificaciones de Canvas?', answer: 'No. Canvas sigue siendo la fuente oficial de tu curso y conviene dejar activadas sus alertas de fecha de entrega y de cambios en tareas. Semora aporta la anticipación, la vista de todos los cursos juntos y el contexto de cuánto pesa cada entrega.' },
      { question: '¿Con cuánta anticipación puedo recibir un aviso?', answer: 'El plan Gratis envía recordatorios el mismo día. Con Pro eliges uno o tres días de anticipación, lo configuras una vez y se aplica automáticamente a las entregas siguientes; las horas de silencio evitan además que el aviso llegue de madrugada.' },
      { question: '¿Necesito permiso de mi universidad para conectar Canvas?', answer: 'Para el flujo con token personal, no; la conexión con Canvas está incluida en Pro. Generas el token desde la configuración de tu propia cuenta de Canvas y lo pegas en Semora. Algunas instituciones restringen esa opción; en ese caso puedes crear los cursos escaneando el programa de la materia.' },
      { question: '¿Qué pasa si el profesor cambia una fecha en Canvas?', answer: 'La siguiente sincronización actualiza la tarea y reajusta los recordatorios vinculados, incluida la anticipación que hayas elegido. El historial muestra cuándo se revisó la plataforma y si alguna actualización falló.' },
      { question: '¿Cuántos cursos puedo llevar sin pagar?', answer: 'Hasta cuatro por semestre, con cinco escaneos de programas al mes, seguimiento de tareas y calificaciones ponderadas, y recordatorios el mismo día. Pro quita el límite de cursos y añade la sincronización con Canvas.' },
      { question: '¿Conviene poner todas las notificaciones de Canvas en «de inmediato»?', answer: 'No. Deja en inmediato las de fecha de entrega y cambios en tareas, y manda el resto a resumen diario. Cuando todo parece urgente, nada lo parece, y lo primero que se pierde es el aviso que sí importaba.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[4].path, SPANISH_BLOG_POSTS[4].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[4].title,
    metaDescription: SPANISH_BLOG_POSTS[4].description,
    h1: SPANISH_BLOG_POSTS[4].title,
    lede: 'La técnica no falla por los 25 minutos: falla porque las explicaciones habituales suponen una tarde libre que tu horario no te da.',
    intro: [
      'La técnica Pomodoro, creada por Francesco Cirillo, divide el trabajo en intervalos de concentración —tradicionalmente de 25 minutos— separados por descansos cortos, con un descanso largo después de cada cuatro intervalos. Es sencilla y funciona bien en abstracto. El problema es que las explicaciones habituales dan por hecho una tarde tranquila, sin nada más en el calendario, y un horario universitario rara vez se parece a eso.',
      'Un día de clases no te entrega esa tarde: te entrega recortes. Cincuenta minutos entre una clase y la siguiente. Hora y media alrededor del almuerzo. Noventa minutos antes de que el grupo de trabajo se reúna a las 4. Ninguno es el bloque continuo y silencioso que describe el método, pero en cada uno cabe un ciclo completo, o dos, si planificas con el hueco que realmente tienes y no con el que te gustaría tener.',
      'Este artículo hace esa cuenta explícita: cuántos ciclos entran en cada tipo de hueco, qué queda fuera del reloj, qué tarea conviene en cada ventana y cómo se ve todo eso aplicado a un martes concreto con tres clases.',
    ],
    sections: [
      {
        heading: 'De dónde viene la técnica',
        paragraphs: [
          'Cirillo desarrolló el método a finales de los años ochenta, cuando era estudiante universitario y buscaba una forma de avanzar de verdad con sus materias en lugar de sentirse permanentemente atrasado. Usaba un temporizador de cocina con forma de tomate para medir sus intervalos —pomodoro es «tomate» en italiano— y el nombre sobrevivió mucho después de que la técnica saliera del escritorio donde se inventó.',
          'La mecánica es de una simpleza casi agresiva: 25 minutos de trabajo concentrado, 5 de descanso, cuatro repeticiones y después un descanso largo. Esa simpleza explica por qué sigue viva mientras sistemas de productividad mucho más elaborados quedaron en el camino. No hay nada que configurar más allá de un temporizador y la disposición a detenerte cuando suena, que es la parte que de verdad cuesta.',
        ],
      },
      {
        heading: 'Por qué funciona',
        paragraphs: [
          'Sostener la atención sin interrupciones durante periodos largos es difícil. La concentración se dispersa sola, y fingir lo contrario suele significar más tiempo releyendo el mismo párrafo que entendiéndolo. Recortar la tarea a una ventana definida de 25 minutos no elimina esa dispersión, pero le da un lugar donde caer: el próximo bajón está a pocos minutos de un descanso previsto, no a una distancia indefinida del final de «estudiar un rato».',
          'Ese final definido también importa al principio. «Estudiar un rato» es lo bastante vago como para que empezar se sienta más pesado de lo que la tarea realmente es: no hay línea de meta, así que resulta fácil tratarlo como un compromiso abierto y postergarlo. «Trabajar 25 minutos» es una petición mucho más pequeña, tan pequeña que arrancar no exige demasiada voluntad ni cuando la tarea de fondo —una guía de ejercicios, una lectura densa, un ensayo— intimida por sí sola.',
          'Los descansos hacen tanto trabajo como los bloques. Empujar a través del cansancio sin parar produce rendimientos cada vez menores: la cuarta media hora seguida rara vez rinde lo que rindió la primera, aunque el reloj marque lo mismo. Un descanso corto cada 25 minutos reinicia el presupuesto de atención antes de gastarlo por completo, de modo que el siguiente bloque arranca cerca de su capacidad plena.',
          'Nada de esto necesita un estudio específico para sostenerse. Coincide con lo que uno nota sobre su propia atención cuando se pone a observarla: la concentración no es un recurso constante, empezar suele ser la parte más difícil y los descansos cortos reparan bastante más de lo que su duración sugiere.',
        ],
      },
      {
        heading: 'El hueco que sí tienes',
        paragraphs: [
          'Un día real se parece más a esto: cincuenta minutos entre la clase de las 10 y la de las 11, hora y media alrededor del almuerzo, noventa minutos antes de que el grupo de trabajo se reúna a las 4. Nada de eso es el bloque limpio que asume el manual, pero cada ventana alcanza para un ciclo completo, o para dos, y ya está en tu horario.',
          'Lo que suele pasar con esos huecos es que se van en revisar el teléfono, en una conversación de pasillo o en la conclusión de que «no vale la pena empezar algo por cincuenta minutos». Esa frase es la más cara de todas: da por sentado que el trabajo solo cuenta cuando viene en bloques grandes, y el avance de un semestre se acumula en pedazos, párrafo a párrafo y repaso a repaso.',
        ],
      },
      {
        heading: 'Cómo encajar los ciclos en huecos reales',
        paragraphs: [
          'La adaptación no consiste en cambiar la técnica, sino en medir el hueco de punta a punta antes de empezar. No empieza cuando el profesor deja de hablar, sino cuando ya estás sentado con el material abierto; y no termina cuando suena tu temporizador, sino cuando tienes que estar en el siguiente salón. Guardar las cosas, caminar y hacer la fila del café se restan antes de contar ciclos.',
        ],
        bullets: [
          'Hueco de 50 minutos entre clases: un bloque de 25 minutos, 5 de descanso y un segundo bloque de 25. Eso consume el hueco completo, sin nada de sobra para guardar tus cosas y caminar al otro salón; ese traslado se cuenta aparte, nunca dentro del segundo bloque.',
          'Hueco de 90 minutos: dos ciclos completos —25 de trabajo, 5 de descanso, 25 de trabajo, 5 de descanso— y quedan unos 30 minutos de margen para el traslado, para comer algo o simplemente para no llegar a tu siguiente compromiso ya con retraso.',
          'Bloque de 3 horas, una tarde sin clases: entra la serie clásica de cuatro ciclos, cuatro bloques de 25 minutos con descansos cortos, y después un descanso largo de 15 a 30 minutos. Es la forma completa del método, la que describen las guías cuando presentan la técnica.',
          'Cualquier hueco más corto: un solo ciclo, con un objetivo que quepa entero en él. La regla es no partir un bloque para que entre a la fuerza, porque un bloque cortado a la fuerza no rinde como bloque ni como pausa.',
        ],
      },
      {
        heading: 'Qué tarea va en cada bloque',
        paragraphs: [
          'No todas las tareas encajan igual en 25 minutos. Las que tienen un alcance cerrado —repasar las tarjetas de estudio de una materia, armar el esquema de un ensayo, resolver una sección de una guía de ejercicios— caben en un solo bloque, porque se sabe desde el principio cómo se ven terminadas.',
          'Las tareas grandes funcionan distinto. Escribir el borrador completo de un ensayo no es una tarea de 25 minutos: es un proyecto de varias sesiones disfrazado de una sola. Conviene partirlo con un punto de cierre concreto para cada bloque, «terminar este párrafo» y no «avanzar el ensayo», para que la sesión acabe con algo visible y el bloque siguiente empiece sabiendo dónde retomar, en vez de gastar su arranque en reconstruir dónde te habías quedado.',
          'El tipo de esfuerzo también decide el reparto. Una lectura densa pide un arranque largo antes de rendir, así que va mejor en la ventana ancha; un repaso de tarjetas de estudio arranca en frío y se corta en cualquier punto, así que sobrevive al hueco estrecho.',
        ],
      },
      {
        heading: 'Un martes con tres clases',
        paragraphs: [
          'Toma un martes bastante común: clase a las 9, un hueco de 10:00 a 10:50 antes de la clase de las 11, almuerzo y hueco de 12:00 a 13:30, clase a las 2 de la tarde y la tarde libre después. Ese solo día contiene los tres tipos de hueco.',
          'El hueco de 10:00 a 10:50 es el caso de cincuenta minutos: un bloque de 25, cinco de descanso, otro bloque de 25 y nada de sobra. Es una buena ventana para repasar las tarjetas de estudio de la clase de las 9, mientras el material sigue fresco, o para sacar una respuesta corta de lectura que se entrega más adelante en la semana: algo de alcance cerrado, que no consuma medio bloque solo en arrancar.',
          'La ventana de 12:00 a 13:30 es el caso de noventa minutos: dos ciclos completos y unos 30 minutos de margen para almorzar de verdad, en lugar de comer con una mano y escribir con la otra. Como hay más espacio, aguanta algo de más profundidad: la introducción y la primera sección de un ensayo que se entrega esa semana, o la parte más difícil de una guía de ejercicios. Ese margen final evita llegar a la clase de las 2 con la sensación de venir corriendo.',
          'La tarde libre es el caso de tres horas: la serie completa de cuatro ciclos, con el descanso largo después del cuarto dedicado a comer o a caminar, no saltado. Es el lugar natural para lo que necesita atención sostenida a lo largo de varias sesiones: continuar ese ensayo más allá de la introducción, resolver la guía completa y no solo su primera parte, o alcanzar la lectura que se quedó atrás.',
          'Sumado todo, el día da unos seis ciclos repartidos en tres ventanas que ya estaban en el horario, sin bloquear una sola hora nueva. Y el reparto no es intercambiable: las tarjetas de estudio de la clase de las 9 pierden valor si esperan hasta la noche, y el ensayo no gana nada por empezar en el hueco estrecho de la mañana.',
        ],
      },
      {
        heading: 'Los descansos también hacen trabajo',
        paragraphs: [
          'Cinco minutos alcanzan para levantarte, servirte agua, estirar la espalda o mirar cuál es el siguiente punto de tu lista. No alcanzan para abrir un video ni para entrar en una aplicación diseñada específicamente para que no salgas de ella. Ahí está la diferencia entre un descanso que devuelve atención y uno que la gasta.',
          'El descanso largo, después del cuarto ciclo, es donde va el reinicio de verdad: comer, caminar, tener una conversación completa. Si terminas los cuatro ciclos y sigues en la misma silla mirando la misma pantalla, técnicamente descansaste, pero tu atención no se enteró.',
        ],
      },
      {
        heading: 'Errores que se repiten',
        paragraphs: [
          'Ninguno de estos errores es exótico: son los atajos obvios que una fecha de entrega cercana vuelve tentadores. La técnica funciona por su estructura, no a pesar de ella, así que una versión que se salta los descansos o deja las tareas sin definir ya no es la técnica: es trabajar con un cronómetro al lado.',
        ],
        bullets: [
          'Convertir el descanso en tiempo de redes sociales. Cinco minutos alcanzan para levantarte y estirarte; rara vez alcanzan para abrir una red social y cerrarla a tiempo. Un descanso de cinco minutos que se vuelve de quince sin que lo notes anula la razón misma de cronometrarlo. Levantarte y caminar a otro lado funciona mejor justamente porque no trae su propio mecanismo para que sigas ahí.',
          'Meter una tarea grande y sin definir en un solo bloque. «Avanzar el ensayo» no es una tarea de 25 minutos, es un proyecto de varias sesiones disfrazado de una, y tratarlo como un bloque termina en un avance difuso que no se puede señalar. Un bloque necesita un objetivo concreto —terminar el esquema, escribir el segundo párrafo, resolver los ejercicios del 1 al 5— para que empiece con una línea de meta y tenga alguna posibilidad de terminar en ella.',
          'Saltarse el descanso largo porque la fecha de entrega está encima. Es el error más contraproducente, precisamente porque en el momento se siente productivo. Encadenar el quinto y el sexto ciclo sin reinicio cambia un descanso corto por un bajón largo: la calidad de esos ciclos cae de forma notoria y lo que se pierde después corrigiendo y revisando suele costar más tiempo del que ahorraste.',
          'Planear el hueco como si el traslado no existiera. Si el segundo bloque termina a la hora exacta en que empieza la clase, ya llegaste tarde: el bloque tiene que cerrar antes, con el tiempo del camino contado desde el principio.',
        ],
      },
      {
        heading: 'Cuando el hueco se rompe',
        paragraphs: [
          'Un horario universitario también incluye lo que no aparece en el horario: un compañero que se sienta a preguntarte algo, un salón que cambia de edificio, una fila que avanza más lento de lo previsto. Si la interrupción es breve, pausa el temporizador y retoma: el ciclo sigue siendo válido. Si perdiste el hilo, cierra el ciclo, toma el descanso y vuelve con un objetivo más pequeño.',
          'También vale decidir de antemano qué haces cuando el hueco se encoge. Si la clase anterior se alarga y tus cincuenta minutos se quedan cortos, no comprimas dos bloques a la fuerza: haz uno solo, completo, con su objetivo intacto. Un ciclo terminado deja más que dos a medias.',
        ],
      },
      {
        heading: 'Cuenta lo que terminaste, no solo los minutos',
        paragraphs: [
          'El temporizador mide minutos, no aprendizaje. Al final de cada bloque anota una línea con lo que quedó hecho y con dónde te trabaste: «tarjetas de estudio del tema 3, las de vocabulario salieron y las de fechas no», «ejercicios del 1 al 5, me trabé antes de terminar». Es un gesto de segundos y convierte la sesión en información utilizable.',
          'Esa información sirve para dos cosas. La primera es calibrar: si una guía que habías planeado para un solo bloque acabó ocupando varios, la próxima la planeas como varios y tu horario deja de mentirte. La segunda es detectar cuándo el problema dejó de ser de tiempo: si vuelves bloque tras bloque al mismo punto y sigues atascado, acumular minutos no lo resuelve, y toca cambiar de método o preguntarle al profesor.',
        ],
      },
      {
        heading: 'Un temporizador dentro de la app donde ya están tus fechas',
        paragraphs: [
          'El temporizador de concentración de Semora (Pro) es un temporizador tipo Pomodoro que vive en la misma app donde ya están tus fechas de entrega y tus calificaciones, así que cada sesión queda ligada a un curso concreto y a una tarea concreta. Eso resuelve de paso la pregunta que antecede a cualquier bloque de 25 minutos: qué estudiar hoy.',
          'Al lado están el Plan Inteligente, que arma un horario de estudio con IA a partir de tus fechas reales y lo ajusta cuando esas fechas cambian, y el panel de Carga de trabajo, que muestra las semanas apretadas y los tramos con varios exámenes en todos tus cursos: el contexto para decidir a qué materia le toca el ciclo del martes.',
          'Puedes empezar con el plan Gratis, que incluye cinco escaneos de programas por mes calendario y hasta cuatro cursos. Pro cuesta $3.99 al mes o $19.99 al año y se compra dentro de la app.',
        ],
      },
    ],
    faq: [
      { question: '¿Tengo que usar exactamente 25 minutos?', answer: 'No. Veinticinco es el valor tradicional, no una regla. Lo que importa es que el bloque termine antes de tu siguiente compromiso y que el objetivo quepa dentro. Para organizar apuntes o repasar tarjetas de estudio, un bloque más corto alcanza; para una lectura densa, uno más largo con un descanso proporcionalmente mayor rinde más. Lo que no conviene mover es el final fijo.' },
      { question: '¿Y si el hueco no alcanza para dos bloques?', answer: 'Haz un ciclo completo con un objetivo pequeño y específico: una sección de ejercicios, un repaso de tarjetas de estudio, el esquema de un párrafo. Es mejor que empezar algo grande sabiendo de antemano que lo vas a dejar cortado, porque el corte te obliga a reconstruir el contexto la próxima vez.' },
      { question: '¿Puedo usar el teléfono durante el descanso?', answer: 'Puedes, pero levantarte, beber agua o mirar a lo lejos suele devolverte más concentración. El riesgo real no es el teléfono en sí, sino que cinco minutos se conviertan en quince sin que lo notes y que el bloque siguiente arranque ya dentro del tiempo de la clase.' },
      { question: '¿Qué hago si me interrumpen a la mitad de un bloque?', answer: 'Pausa el temporizador si la interrupción es corta y retoma donde quedaste. Si perdiste el hilo, cierra el ciclo, toma el descanso y vuelve con un objetivo del tamaño de lo que sí puedes terminar en lo que queda del hueco.' },
      { question: '¿Sirve el Pomodoro para lecturas largas?', answer: 'Sí, pero cambia el objetivo. En vez de «leer el capítulo», define «leer hasta el final de la primera sección y anotar la idea principal de cada parte». Así el bloque termina en un punto medible y no en la página donde te venció el sueño.' },
      { question: '¿Necesito Pro para usar el temporizador de concentración?', answer: 'Sí, forma parte de Semora Pro, que cuesta $3.99 al mes o $19.99 al año y se compra dentro de la app. El plan Gratis incluye cinco escaneos de programas por mes calendario y hasta cuatro cursos, así que puedes montar el semestre antes de decidir.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[5].path, SPANISH_BLOG_POSTS[5].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[5].title,
    metaDescription: SPANISH_BLOG_POSTS[5].description,
    h1: SPANISH_BLOG_POSTS[5].title,
    lede: 'Lo que vuelve difícil el periodo de finales —varios exámenes de mucho peso apretados en pocos días— es justo lo único que puedes ver venir con semanas de anticipación.',
    intro: [
      'Un plan de finales suele fallar por la misma razón: reparte las horas en el orden en que aparecen los exámenes. Es un criterio cómodo y engañoso, porque el examen que llega primero rara vez es el que más necesita tu tiempo.',
      'Un plan que sí funciona cruza dos variables que rara vez se miran juntas. La primera es la densidad: cómo se agrupan los exámenes en el calendario y qué días quedan libres. La segunda es el peso de cada final combinado con la calificación que ya llevas. Por separado, cada una da una respuesta incompleta; juntas te dicen a qué curso le debes horas.',
      'A continuación, los cinco pasos, un ejemplo con un horario concreto y —la parte que el consejo de estudio habitual se salta— qué hacer realmente dentro de cada bloque que agendaste.',
    ],
    sections: [
      {
        heading: 'Paso 1: anota cada final y cuánto vale de verdad',
        paragraphs: [
          'Empieza por un inventario sin adornos: cada examen final, su fecha, su hora y qué porcentaje de la calificación del curso representa. Mientras esa tabla no exista, cualquier prioridad que establezcas es una corazonada.',
          'La diferencia salta a la vista en cuanto la escribes. Un final que vale 40 % en una materia donde vienes batallando exige un trato distinto al de otro que vale 15 % en una materia donde tu calificación ya está firme. Tratar todos los finales como igual de urgentes es la manera exacta de repartir mal el tiempo.',
          'El porcentaje casi siempre está en el programa de la materia, en la tabla de criterios de evaluación. Vale la pena cotejarlo con los anuncios del curso: cuando un profesor cancela una tarea o cambia una ponderación a mitad del semestre, el programa queda desactualizado y nadie lo reescribe.',
          'Anota en la misma línea si el final es acumulativo: dos finales que valen lo mismo piden esfuerzos muy distintos si uno cubre todo el semestre y el otro solo las últimas unidades.',
        ],
      },
      {
        heading: 'Paso 2: cruza el peso con la calificación que ya llevas',
        paragraphs: [
          'El peso solo no alcanza. Un final que vale mucho en un curso donde vas cómodamente arriba necesita menos horas de refuerzo que un final más pequeño en un curso donde tu calificación está en el filo. Lo que decide no es cuánto vale el examen, sino cuánto puede moverse tu calificación.',
          'Y ese «dónde estás hoy» tiene que ser un número, no una impresión. La sensación de que «esa materia va bien» se arma con el recuerdo de las últimas calificaciones que viste, casi nunca con el promedio ponderado real. Saca la cuenta con lo que ya está calificado y hazte una pregunta por curso: ¿qué necesito sacar en el final para conservar la calificación que quiero?',
          'Esa pregunta tiene dos respuestas útiles y ninguna es «estudia más». Si ni un examen perfecto mueve la calificación del curso, ese final necesita mantenimiento y las horas rinden más en otra materia. Si incluso un examen decente se queda corto, conviene saberlo mientras aún se puede reorganizar la semana.',
        ],
      },
      {
        heading: 'Paso 3: lee el calendario por densidad, no solo por fechas',
        paragraphs: [
          'Pon todos los finales en un solo calendario y busca aglomeraciones: dos exámenes el mismo día, o tres en 48 horas. Ese patrón, y no la fecha aislada de cada examen, es lo que define cuánto tiempo real vas a poder dedicarle a cada materia.',
          'Un final que en teoría tendría una semana completa de repaso puede terminar con dos días útiles si queda encajonado entre otros dos exámenes: los días siguen ahí, pero ya están comprometidos con las materias vecinas.',
          'Detectarlo con anticipación te permite adelantar el repaso de los exámenes atrapados en la aglomeración, en lugar de descubrir el choque la misma semana en que ocurre, cuando ya no queda nada que reacomodar.',
        ],
      },
      {
        heading: 'Paso 4: agenda los repasos como si fueran citas',
        paragraphs: [
          'Cuando ya sabes qué finales necesitan más tiempo y qué días están más comprimidos, reserva bloques de repaso en el calendario. No «estudiar química» como intención flotante, sino un bloque con día, hora de inicio, duración y un objetivo verificable: resolver los ejercicios de la unidad de equilibrio químico con el libro cerrado y anotar cuáles fallaste. Eso es lo que separa un bloque de repaso de un rato de buena voluntad.',
          'Reparte el repaso de cada examen en varias sesiones en lugar de un solo maratón la noche anterior. La razón no es solo el cansancio: como verás más adelante, la separación entre sesiones forma parte del trabajo por sí sola. Varias sesiones en días distintos rinden más que una sola la víspera, aunque sumen exactamente las mismas horas.',
        ],
      },
      {
        heading: 'Paso 5: protege el sueño y una cosa que harías de todos modos',
        paragraphs: [
          'La tentación de recortar el sueño y cancelar todo lo que no sea académico es fortísima en finales, pero el rendimiento depende de bastante más que las horas acumuladas de estudio. Un cerebro que durmió poco recupera peor lo que aprendió, y recuperar información es exactamente lo que te van a pedir.',
          'Agenda un horario de sueño normal y por lo menos una cosa —entrenar, cocinar bien, ver a alguien, lo que sea que te despeje la cabeza— como un bloque fijo e innegociable. La palabra clave es fijo: si esa actividad solo ocurre «si sobra tiempo», nunca ocurre, porque en finales nunca sobra tiempo.',
        ],
      },
      {
        heading: 'Una semana de finales real',
        paragraphs: [
          'Así se ven los pasos 1 a 3 aplicados a un horario concreto y no en abstracto. Supongamos que tus finales caen así:',
          'El paso 3 marca el problema de inmediato: el miércoles tiene dos finales, y ese no es un dato que quieras descubrir el martes en la noche. Todo el repaso que te falte para cualquiera de los dos tiene que estar hecho antes, porque ese día no hay ningún hueco entre uno y otro: la noche antes de Cálculo es también la mañana antes de Historia. Eso empuja el repaso de ambas materias al fin de semana, al lunes y al martes.',
          'Los pasos 1 y 2 terminan de reacomodar el plan. Supongamos que Biología vale 20 % del curso y llevas un cómodo 92: salvo que el examen te salga francamente mal, tu calificación en esa materia ya está decidida. Cálculo también vale 20 %, pero llevas un 78 mucho más frágil, lo bastante en el filo como para que un final mediocre te baje la calificación del curso una letra entera. Aunque Biología llegue primero, las horas deben inclinarse hacia Cálculo: confundir «lo que viene primero» con «lo más urgente» es el error que los pasos 1 y 2 existen para atrapar.',
          'El martes libre es la válvula de escape: el lugar evidente para el repaso de Cálculo e Historia que no puede hacerse la noche anterior. Biología recibe una pasada de mantenimiento el domingo, lo justo para no llegar en frío, e Inglés conserva una preparación normal, porque ninguna otra materia de esa semana compite por los días previos.',
        ],
        bullets: [
          'Lunes: Biología a las 9:00',
          'Martes: sin exámenes',
          'Miércoles: Cálculo a las 9:00 e Historia a las 14:00',
          'Jueves: Inglés a las 9:00',
        ],
      },
      {
        heading: 'Qué hacer dentro del bloque: recuperación activa y práctica espaciada',
        paragraphs: [
          'El paso 4 dice que pongas sesiones de repaso en el calendario, pero no qué hacer durante ellas, y esa decisión pesa casi tanto como el número de horas. Releer un capítulo o subrayar apuntes se siente productivo, pero solo comprueba si el material te resulta familiar cuando lo tienes enfrente. Reconstruirlo de memoria, sin apuntes y contrarreloj, es la única habilidad que se evalúa en un examen.',
          'La recuperación activa cierra esa brecha: tapar los apuntes e intentar resolver un ejercicio, escribir una definición completa o explicar un concepto en voz alta como si se lo enseñaras a alguien, y solo después contrastar el resultado con la fuente. El esfuerzo de recuperar una respuesta, incluso de forma imperfecta, deja una memoria más sólida y duradera que volver a leer el mismo material. Una tarjeta de estudio que te cuesta responder hace más por tu retención que una que reconoces al instante.',
          'El espaciamiento funciona con la misma lógica. Para el mismo total de horas, se retiene más cuando el repaso se reparte en varias sesiones en días distintos que cuando se comprime en una sola sesión larga la víspera. Cada regreso al material después de una pausa obliga al mismo esfuerzo de recuperación que vuelve útil la recuperación activa. Por eso el paso 4 pide varios bloques por examen: el espaciamiento forma parte del trabajo, no solo las horas.',
          'Conviene aceptar el costo de antemano: recordar se siente peor que releer, porque deja huecos y dudas, y esa incomodidad es la señal de que el bloque está funcionando.',
        ],
      },
      {
        heading: 'Cómo se traduce eso en cada materia',
        paragraphs: [
          'En términos prácticos, una sesión de repaso debería parecerse más a un examen que a una lectura: resolver ejercicios desde cero, pasar tarjetas de estudio o resumir un tema de memoria y solo después revisar los apuntes. Aplicado al horario del ejemplo, cada materia se ve distinta.',
          'La prueba para saber si un bloque estuvo bien aprovechado es simple: si al terminar puedes decir qué te salió mal, estuviste recuperando; si solo puedes decir cuántas páginas cubriste, estuviste leyendo.',
        ],
        bullets: [
          'Cálculo: cerrar el libro y resolver series de ejercicios en frío, no releer los ejemplos ya resueltos.',
          'Historia: escribir de memoria la respuesta a una pregunta de ensayo probable y solo después compararla con los apuntes.',
          'Inglés: producir vocabulario y conjugaciones en voz alta o por escrito, en lugar de leer una lista y reconocerla como correcta.',
        ],
      },
      {
        heading: 'Logística del día del examen',
        paragraphs: [
          'Hay detalles que conviene confirmar un día antes y no la mañana del examen. Muchas instituciones publican un calendario oficial de exámenes finales que reemplaza el horario y el salón habituales de la clase, para que los finales no choquen entre sí. Ese calendario, y no el programa que te dieron la primera semana del semestre, es el que manda una vez publicado.',
          'Varios finales se dan en un salón distinto al de siempre, sobre todo en materias que juntan a varios grupos en un mismo bloque de examen; revisar el salón importa tanto como revisar la fecha. Confirma también qué está permitido durante el examen: calculadora, una hoja de apuntes, hojas para borrador. Esas reglas varían de un profesor a otro, y la puerta del salón es el peor lugar para enterarse.',
          'Y come algo sustancioso antes de un bloque de examen de varias horas: presentarte con el estómago vacío es una desventaja que te impones tú y que no tiene relación con qué tan bien te sabes el material.',
        ],
      },
      {
        heading: 'Esto no promete una semana sin estrés',
        paragraphs: [
          'Nada de lo anterior vuelve fácil la semana de finales, ni pretende hacerlo. El objetivo es más modesto: que el estrés que aparezca sea proporcional a lo difícil que es de verdad el material, y no esté amplificado por algo que pudiste haber visto venir.',
          'Un examen exigente en un tema complicado va a costarte, con plan o sin plan. Descubrir el martes que el miércoles tienes dos finales, o enterarte en la última semana de que una materia estaba en el filo, es un costo que se suma al primero y que no le enseña nada a nadie.',
        ],
      },
      {
        heading: 'Dónde se vuelve más fácil con la información a la vista',
        paragraphs: [
          'Armar este plan a mano significa cruzar la fecha del examen, la ponderación y tu calificación actual de cada curso, y rehacerlo cada vez que algo cambia. Semora deja esa información a la vista sin ese trabajo. El seguimiento de calificaciones está en el plan Gratis —junto con cinco escaneos de programas por mes calendario y hasta cuatro cursos— y mantiene al día el promedio ponderado de cada curso conforme se califica tu trabajo, que es el número que pide el paso 2.',
          'Semora Pro cuesta $3.99 al mes o $19.99 al año y agrega el panel de carga académica, que muestra las semanas pesadas y la densidad de exámenes de todos tus cursos en una sola vista: justo la aglomeración que el paso 3 pide detectar con anticipación. El Plan Inteligente arma un horario de estudio con esas fechas y lo reajusta cuando alguna se mueve, y las alertas de riesgo académico señalan un curso donde la calificación viene cayendo.',
        ],
      },
    ],
    faq: [
      { question: '¿Cuándo debo armar el plan?', answer: 'En cuanto tu institución publique el calendario oficial de finales, que sale bastante antes de la semana en sí. Aunque ese día no puedas planificar nada más, anotar la fecha, la hora y la ponderación de cada examen en una sola lista ya deja resuelta la parte difícil.' },
      { question: '¿Cómo priorizo dos exámenes el mismo día?', answer: 'No repartas el tiempo en partes iguales de entrada. Compara la ponderación y la calificación que llevas en cada curso, y recuerda que el examen de la tarde tiene menos margen: las horas previas se te van en el examen de la mañana.' },
      { question: '¿De verdad no sirve estudiar toda la noche anterior?', answer: 'Sirve menos de lo que cuesta. Las mismas horas repartidas en varios días retienen más, y llegar sin dormir afecta justo lo que el examen mide: recuperar información bajo presión. Fija una hora tope para cerrar los apuntes la noche previa y respétala.' },
      { question: '¿Qué hago si ya no alcanza el tiempo?', answer: 'Recorta a conciencia en lugar de fingir que todo cabe. Quédate con los temas de mayor peso en el examen y con los que peor dominas, y cambia la lectura pasiva por práctica activa: resolver ejercicios en frío rinde más que releer el capítulo entero.' },
      { question: '¿Necesito Pro para organizar mis finales?', answer: 'No. Las fechas, los cursos y el seguimiento de calificaciones están en el plan Gratis, que incluye cinco escaneos de programas por mes calendario y hasta cuatro cursos. Pro agrega el panel de carga académica, el Plan Inteligente y las alertas de riesgo académico, que automatizan buena parte de los pasos 2 y 3.' },
      { question: '¿Y si el programa y el calendario oficial no coinciden?', answer: 'Rige el calendario oficial de tu institución, que se publica después del programa justamente para resolver choques entre materias. Si la diferencia es de ponderación y no de fecha, pregúntale al profesor y deja registrado el dato correcto donde lleves tus cursos.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[6].path, SPANISH_BLOG_POSTS[6].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[6].title,
    metaDescription: SPANISH_BLOG_POSTS[6].description,
    h1: SPANISH_BLOG_POSTS[6].title,
    lede: '«App de estudio con IA» describe por lo menos tres productos distintos que resuelven tres problemas distintos, y casi toda la decepción viene de comprar una categoría esperando otra.',
    intro: [
      'Las apps centradas en el programa (Semora, DormWay) leen los documentos de tus materias y arman un semestre de fechas de entrega. Las centradas en el material (StudyFetch, Mindgrasp, Studley AI) convierten un PDF o la grabación de una clase en tarjetas de estudio, apuntes y cuestionarios. Las centradas en la agenda (Shovel, myHomework) organizan el tiempo y las tareas que tú registras o importas.',
      'Solo la primera categoría responde «qué se entrega y cuánto vale». Solo la segunda responde «ayúdame a aprender este capítulo». Si necesitas las dos cosas, la respuesta honesta suele ser una app de cada categoría, o una sola que cubra la estructura del semestre y genere material de estudio desde esa misma fuente.',
      'Los precios que aparecen abajo van desde gratis hasta unos $12.88 al mes. Todo lo que sigue proviene de los materiales publicados por cada producto o, cuando se indica, de reseñas de terceros.',
    ],
    sections: [
      {
        heading: 'Las siete apps de un vistazo',
        paragraphs: [
          'La tabla siguiente es la forma más rápida de ver dónde está parada cada app. Los precios en particular cambian con frecuencia, así que tómalos como punto de partida y confirma en la página de precios del proveedor antes de pagar.',
        ],
        table: {
          columns: ['App', 'Construida alrededor de', 'Programa → fechas de entrega', 'Seguimiento de calificaciones', 'Precio'],
          highlightColumn: 0,
          caption: 'Recopilado de los materiales publicados por cada producto en agosto de 2026; las cifras señaladas como reportadas provienen de reseñas de terceros. Los precios de la competencia cambian seguido: confírmalos en la página del proveedor.',
          rows: [
            ['Semora', 'Tu programa de clase: el documento se convierte en el semestre', 'Sí. Foto (hasta 5 páginas), PDF, arrastrar y soltar, o texto pegado', 'Sí, en el plan Gratis, con categorías ponderadas', 'Plan Gratis; Pro $3.99/mes o $19.99/año'],
            ['DormWay', 'El programa más sincronización de solo lectura con el LMS', 'Sí. Se sube en la app o se envía por correo a su dirección de recepción', 'Sí: una calculadora de GPA y calificaciones con categorías ponderadas', 'Gratis, sin plan de pago'],
            ['Shovel', 'Bloques de tiempo: las fechas se vuelven un calendario de estudio', 'Sí. PDF procesado con pantalla de revisión, o conectando un LMS', 'No está confirmado públicamente como función central', 'Reportado en $9.79/mes o $39/año tras una prueba de 7 días'],
            ['StudyFetch', 'El tutor Spark.E, que responde desde tus propios materiales', 'Parcial. Fotografías el programa y extrae eventos, por cada subida', 'No es un libro de calificaciones dedicado: sus funciones de evaluación se centran en ensayos y simulacros de examen', 'Plan gratuito; reportado en ~$7.99–$11.99/mes'],
            ['Mindgrasp', 'Un archivo subido → apuntes, tarjetas y cuestionario', 'No se encontró análisis de programas en sus materiales públicos', 'No está confirmado públicamente', 'Reportado en ~$5.99–$10.99/mes'],
            ['Studley AI', 'PDF, diapositivas y videos subidos → conjuntos de estudio', 'No se encontró análisis de programas en sus materiales públicos', 'Mide el dominio del material, no la calificación del curso', 'Gratis: 1 conjunto al día; reportado en $12.88/mes o $97.76/año'],
            ['myHomework', 'Una agenda clásica: registro manual más importación desde el LMS', 'No. Registro manual, o importación desde un LMS compatible', 'No se describe como función central', 'Gratis con anuncios; versión sin anuncios reportada en unos $4.99/año'],
          ],
        },
      },
      {
        heading: 'Las tres categorías, y por qué la distinción importa',
        paragraphs: [
          'Casi toda reseña frustrada de una app de estudio es un error de categoría, no un producto roto. Alguien descarga un generador de tarjetas esperando que le avise cuándo es el parcial, o descarga una agenda esperando que le explique un capítulo, y concluye que la app es mala cuando simplemente está hecha para otro trabajo.',
          'Las apps centradas en el programa tratan el documento del curso como la fuente de verdad. Lo leen, extraen cada tarea, examen, cuestionario, proyecto y lectura con su fecha, y normalmente también los datos estructurales: ponderaciones, horarios de clase, horario de atención, inicio y fin del semestre. La ventaja es que una sola subida produce un semestre completo, y las fechas llegan con contexto: no «ensayo el 14 de octubre», sino «ensayo el 14 de octubre, vale el 15 %».',
          'Las apps centradas en el material tratan tus documentos de estudio como la fuente de verdad. Les das la grabación de una clase, unas diapositivas, un capítulo o un video, y devuelven resúmenes, tarjetas, preguntas de práctica y un tutor que responde a partir de esa subida. Son genuinamente útiles la semana previa a un examen, y estructuralmente incapaces de decirte cuándo es ese examen, porque nada en su proceso leyó nunca tu programa.',
          'Las apps centradas en la agenda tratan lo que tú escribes como la fuente de verdad. Registras materias y tareas, o las importas de Canvas, y la app programa, recuerda y muestra. La IA en esta categoría, cuando existe, vive en la capa de planificación: estimar cuánto va a tomar algo, o reservarle tiempo.',
          'Lo que hace práctica esta distinción es que las categorías fallan en direcciones opuestas. Una app centrada en el material te generará con gusto 60 tarjetas de una materia en la que estás a punto de perder una entrega. Una app centrada en la agenda te recordará una entrega que no tiene forma de ayudarte a cumplir. Saber cuál de las dos carencias tienes es la mayor parte de la decisión.',
        ],
      },
      {
        heading: 'Centradas en el programa: Semora y DormWay',
        paragraphs: [
          'Estas dos son la comparación más directa de la lista, porque parten de la misma premisa: el programa ya contiene tu semestre y transcribirlo a mano es el cuello de botella.',
          'Semora importa un programa como foto (varias páginas, hasta cinco), PDF, archivo arrastrado en la versión web, o texto pegado. OpenAI GPT-5.6 Luna extrae el nombre del curso, el profesor, los horarios de clase, el horario de atención, las fechas del semestre, la escala de calificación y cada elemento evaluado con su fecha de entrega. Nada se guarda hasta que lo revisas en pantalla, y eso importa más de lo que parece: los programas están llenos de frases ambiguas como «se entrega el viernes anterior al receso», y una pantalla de revisión es la diferencia entre detectar una fecha mal interpretada y heredarla. El plan Gratis cubre cinco escaneos por mes calendario, hasta cuatro cursos en un semestre, seguimiento completo de entregas y de calificaciones con promedios ponderados, y recordatorios el mismo día. Pro, a $3.99 al mes o $19.99 al año, levanta los límites de escaneos y cursos y agrega importación desde Canvas, Blackboard y Moodle, el Plan Inteligente de estudio, el panel de carga académica, tarjetas de estudio con repetición espaciada, temporizador de concentración, un tutor con IA basado en tu propio material, sincronización con el calendario y exportación .ics, horarios de recordatorio personalizados y alertas de riesgo académico.',
          'DormWay recibe programas subidos en la app o enviados por correo a su dirección de recepción, y extrae tareas, fechas de examen, desglose de calificación y políticas de entrega tardía. También ofrece sincronización de solo lectura con Canvas, Blackboard y Moodle unificadas en una sola línea de tiempo, una calculadora de GPA y calificaciones con categorías ponderadas, un asistente llamado «Ace» que responde preguntas sobre las políticas del curso citando el punto del programa de donde salió la respuesta, y una pestaña de «Intelligence» por curso con estimación de dificultad y horas semanales. Su propio sitio y su ficha en la App Store lo describen como gratuito, sin muros de pago y sin tarjeta de crédito. Funciona en web, iPhone, iPad y Mac; no tiene app para Android.',
          'La división práctica: DormWay no cuesta nada, cubre tres plataformas LMS en modo lectura desde el inicio, y su app para Mac es algo que Semora no tiene. Las ventajas de Semora son la variedad de entrada (la foto de un programa en papel que te entregaron en clase, no solo un archivo que ya tienes), el paso de revisión antes de guardar, y la profundidad del lado del estudio: tarjetas con repetición espaciada, temporizador, tutor y un generador de horarios que se reajusta con tus fechas. Si el costo es la restricción que decide, el plan gratuito de DormWay es realmente gratuito. Si quieres la capa de fechas y la de estudio en la misma cuenta, ese es el argumento a favor de Semora Pro.',
        ],
      },
      {
        heading: 'Centradas en el material: StudyFetch, Mindgrasp y Studley AI',
        paragraphs: [
          'Es la categoría más concurrida y aquella donde el marketing suena más parecido. Las tres reciben contenido y devuelven material de estudio. Las diferencias están en qué aceptan, qué producen y si algo se conecta con tus cursos reales.',
          'StudyFetch está construido alrededor de Spark.E, un tutor que responde a partir de tus propios materiales en lugar de la web abierta, una distinción con consecuencias: hace que las respuestas sean rastreables hasta algo que tu profesor efectivamente asignó. Genera tarjetas, cuestionarios y simulacros de examen a partir de lo que subes, ofrece planes de estudio con repetición espaciada y da retroalimentación sobre ensayos. Sí tiene una función de programa: fotografías un programa o un calendario y Spark.E extrae los eventos a un calendario con recordatorios. Según las descripciones disponibles, funciona por cada subida y no agregando automáticamente las fechas de todos tus cursos. StudyFetch también documenta una integración LTI 1.3 con Canvas, Blackboard, Schoology, D2L Brightspace y Google Classroom con sincronización de listas, pero esa la implementa la institución, no el estudiante, así que solo está disponible si tu universidad ya la configuró. Reseñas de terceros reportan un plan gratuito (alrededor de 10 conversaciones con el tutor, un conjunto de estudio y dos subidas), un plan Base cercano a $7.99 al mes, uno Premium cercano a $11.99, un paquete semestral cercano a $49.99 y un plan anual cercano a $99.99; nada de eso está confirmado en la propia página de precios de StudyFetch, así que conviene verificarlo antes de comprar. Funciona en web, iOS y Android.',
          'Mindgrasp tiene el rango de entrada más amplio: PDF, DOCX, PowerPoint, MP3 y MP4, videos de YouTube y artículos web. Le das cualquiera de esos y produce apuntes, resúmenes, tarjetas y cuestionarios, con un tutor con IA para preguntas de seguimiento y un plan superior que agrega un experto en matemáticas. Declara compatibilidad con Canvas, Blackboard y Panopto, lo que parece significar importar archivos de esas plataformas y no analizar programas ni fechas. No aparece ninguna función de análisis de programas ni de extracción de fechas en sus materiales públicos, ni seguimiento de calificaciones. El precio no está listado en su propio sitio; reseñas de terceros reportan aproximadamente $5.99–$10.99 al mes según el plan, más barato con facturación anual, con una prueba corta. Se distribuye como app de iOS, app web y extensión de Chrome; la disponibilidad en Android no es clara.',
          'Studley AI acepta PDF, diapositivas, videos de YouTube, enlaces a artículos y fotos de apuntes escritos a mano, y los convierte en tarjetas, cuestionarios y material de estudio en audio. Una función llamada «Solve» da ayuda paso a paso con tareas a partir de una foto, y un tutor con IA responde preguntas sobre lo que subiste. Mide el dominio de ese material en cuatro niveles, de desconocido a dominado, lo cual es seguimiento de progreso, pero de tu memoria, no de tu calificación. No aparecen integraciones con LMS ni análisis de programas en sus materiales disponibles. El plan gratuito cubre un conjunto de estudio al día; el plan Unlimited está reportado por reseñas de terceros en $12.88 al mes o $97.76 al año. Funciona en iOS, Android y web.',
          'Ninguna de las tres intenta ser tu agenda, y leerlas como agendas es el error. En lo que sí son buenas es en el último tramo antes de una evaluación: ya tienes el material, tienes poco tiempo y quieres convertirlo en algo que puedas practicar activamente en vez de releer.',
        ],
      },
      {
        heading: 'Centradas en la agenda: Shovel y myHomework',
        paragraphs: [
          'Shovel es la app con la postura más definida de esta lista, y la postura es buena: conocer una fecha de entrega no es lo mismo que tener tiempo para cumplirla. Procesa un PDF del programa con pantalla de revisión, o se conecta en modo lectura a Canvas, Brightspace, Moodle y Google Classroom, actualizándose aproximadamente cada 24 horas, y después hace lo que las demás no hacen: compara el tiempo que van a tomar tus tareas contra el tiempo que realmente tienes, y lo reserva en el calendario. Sus alertas «Cushion» avisan cuando te comprometiste a más de lo que cabe, y estima el tiempo de lectura a partir del número de páginas. El seguimiento de calificaciones no está confirmado como función central; sus materiales públicos hablan de planificación. Su página de precios lista actualmente $9.79 al mes (con descuento desde $19.99) y $39 al año tras una prueba gratuita de 7 días, aunque otras fuentes citan cifras distintas: conviene verificarlo directamente. La configuración empieza en la app web, con iOS y Android nativos como acompañantes.',
          'myHomework es la opción tradicional y es honesta al respecto. Registras materias y tareas a mano, o las importas de Canvas, D2L, Google Classroom, Blackboard y Schoology; una cuenta premium actualiza la agenda automáticamente con las tareas nuevas que vayan apareciendo. No hay escaneo de programas, ni tarjetas de estudio, ni tutor, y el seguimiento de calificaciones no se describe como función central. Lo que tiene, en cambio, es alcance: iOS, Android, Mac, Windows, Chrome, Kindle Fire y web, una cobertura de plataformas mayor que cualquier otra de esta lista, además de una versión gratuita con anuncios y una versión sin anuncios reportada en unos $4.99 al año. Si ya conoces tus fechas, las quieres en todos los dispositivos que usas y no te interesan las funciones de IA, es una opción razonable y muy barata.',
        ],
      },
      {
        heading: 'Cómo elegir: parte del problema, no de la lista de funciones',
        paragraphs: [
          'Las listas de funciones premian a quien escriba la más larga. Un método mejor es nombrar la falla concreta que te sigue pasando, porque cada categoría corresponde a una.',
          'La mayoría de los estudiantes tiene dos de estas a la vez, y por eso la respuesta de una sola app suele estar equivocada. La combinación que cubre más terreno es una app que se haga cargo de la estructura del semestre y otra del material de estudio, o una que haga las dos cosas desde la misma fuente. Ese es el argumento de Semora: como ya tiene tu programa y los apuntes que subiste, su generador de tarjetas no necesita una subida aparte, y puede acotar un mazo a un examen concreto tomado de tus entregas registradas en vez de a todo el curso.',
        ],
        bullets: [
          '«Me enteré la noche anterior de que había una entrega». Tienes un problema de captura de fechas. La solución es una app centrada en el programa, porque la fecha tiene que existir en tu sistema desde la primera semana y no desde el día que te acordaste de escribirla.',
          '«Sé qué se entrega, pero nunca empiezo con tiempo». Tienes un problema de planificación. Shovel está hecha exactamente para eso, y el Plan Inteligente y el panel de carga académica de Semora atacan la misma carencia desde el lado del programa.',
          '«Leí el capítulo tres veces y aun así me fue mal en el cuestionario». Tienes un problema de recuperación de memoria, y releer no lo arregla. Una app centrada en el material, o las tarjetas de Semora, convierten el material pasivo en práctica activa.',
          '«No sé si voy bien en esta materia». Tienes un problema de visibilidad de la calificación, más acotado de lo que parece: necesitas seguimiento ponderado, que Semora incluye gratis y DormWay cubre con su calculadora.',
          '«Canvas me avisó demasiado tarde». Ese es específicamente un problema de momento de la notificación, y tiene su propia solución.',
        ],
      },
      {
        heading: 'Qué significa realmente «IA» en cada app',
        paragraphs: [
          'La palabra hace trabajos muy distintos a lo largo de esta lista, y vale la pena ser concreto, porque «con IA» no te dice nada sobre si una app te va a servir.',
          'En las apps centradas en el programa, la IA hace extracción: leer un documento sin estructura, escrito por una persona sin formato consistente, y producir datos ordenados (una fecha, un título, una ponderación, una categoría). Es el trabajo con más probabilidad de salir mal en silencio, y por eso la presencia de un paso de revisión antes de guardar importa más que el modelo que hay detrás. Semora y Shovel ponen uno en el camino.',
          'En las apps centradas en el material, la IA hace generación: producir texto nuevo —un resumen, una pregunta, una tarjeta, una explicación— a partir del material fuente. Los fallos de generación son más visibles que los de extracción (una tarjeta absurda salta a la vista; una fecha con dos días de error, no), pero también son más frecuentes, y un mazo generado de un capítulo que no leíste es una mala forma de descubrirlo.',
          'En las apps centradas en la agenda, la IA, cuando existe, hace estimación: adivinar cuánto va a tomar algo. Es lo más difícil de hacer bien de los tres y lo más fácil de verificar tú mismo, porque en una semana sabrás si las estimaciones coinciden con tu realidad.',
          'Juzga una app por cuál de estos tres trabajos hace y qué tan bien lo hace, no por si la palabra aparece en su portada.',
        ],
      },
      {
        heading: 'Los planes gratuitos, comparados con honestidad',
        paragraphs: [
          'El plan gratuito es donde suele tomarse la decisión de verdad, porque casi ningún estudiante va a pagar por una app de estudio antes de comprobar que la va a usar. También es donde el marketing es más laxo, así que esto es lo que da cada uno en realidad.',
          'El patrón que conviene notar: los planes gratuitos de la categoría centrada en el material son demostraciones, dimensionadas para enseñarte el producto antes del muro de pago. Los de las categorías centradas en el programa y en la agenda son utilizables: el de DormWay indefinidamente, el de Semora para un semestre de cuatro cursos, el de myHomework con anuncios. Esa diferencia es de estructura de costos, no de generosidad: generar tarjetas y respuestas de tutor le cuesta dinero al proveedor cada vez que se usa; guardar una fecha de entrega, no.',
        ],
        table: {
          columns: ['App', 'Qué incluye el plan gratuito', 'El límite principal'],
          highlightColumn: 0,
          caption: 'Detalles de los planes gratuitos según lo publicado por cada proveedor, agosto de 2026. Los planes gratuitos cambian más seguido que los de pago.',
          rows: [
            ['Semora', '5 escaneos de programas por mes calendario, hasta 4 cursos, seguimiento completo de entregas y de calificaciones con promedios ponderados, recordatorios el mismo día y unirte a un curso que comparta un compañero', 'Cuatro cursos en un solo semestre: una cuenta gratuita no puede abrir un segundo periodo'],
            ['DormWay', 'Todo. El producto es gratuito y no tiene plan de pago, incluidas la sincronización con el LMS y la calculadora de calificaciones', 'No hay app para Android, y la sincronización con las tres plataformas LMS es de solo lectura'],
            ['Shovel', 'Una prueba de 7 días en lugar de un plan gratuito permanente, según su propia página de precios', 'Es una prueba: después la app es solo por suscripción'],
            ['StudyFetch', 'Reportado en unas 10 conversaciones con el tutor, 1 conjunto de estudio y 2 subidas', 'Lo bastante pequeño como para funcionar como demostración y no como un plan de uso continuo'],
            ['Mindgrasp', 'Una prueba corta, según reseñas de terceros; no se documenta un plan gratuito permanente', 'El precio no está publicado en su propio sitio'],
            ['Studley AI', 'Un conjunto de estudio al día', 'Suficiente para una materia, restrictivo para una carga completa de cursos'],
            ['myHomework', 'La agenda completa, sostenida con anuncios', 'La importación desde el LMS y los archivos adjuntos quedan detrás del plan de pago'],
          ],
        },
      },
      {
        heading: 'Los límites que conviene conocer antes de decidir',
        paragraphs: [
          'Hay cosas que son ciertas para todas las apps de esta lista, y ninguna comparación de funciones las cambia.',
          'La extracción no es perfecta y el paso de revisión no es opcional. Los programas traen exámenes «por definir», entregas semanales comprimidas en una sola línea y fechas escritas en relación con la sesión de clase. Todo analizador con IA hereda esas ambigüedades. Las apps que te muestran lo que extrajeron antes de guardarlo —Semora y Shovel, entre ellas— no están siendo cautelosas por gusto: están poniendo el paso de corrección donde te cuesta treinta segundos en lugar de una entrega perdida.',
          'Una app no puede ver los cursos que nunca le diste. Suena obvio y es la falla más común en la práctica. Un panel de carga académica que señala una semana pesada solo puede señalarla entre los cursos que efectivamente importaste. Si dos de tus cinco materias nunca entraron, el panorama está equivocado con toda seguridad, en vez de verse incompleto.',
          'El material de estudio generado es un punto de partida, no un sustituto de la lectura. Unas tarjetas hechas de un capítulo que no abriste van a evaluar tu memoria de un resumen, que no es lo mismo que entender el capítulo. El consenso de la investigación sobre práctica de recuperación es que rinde más que releer, pero ese hallazgo asume que aprendiste el material una primera vez.',
          'Los precios de esta categoría se mueven. Varias de las cifras de arriba provienen de reseñas de terceros porque los proveedores no publican precios en sus propios sitios, y los que sí lo hacen aplican promociones. Cada número de aquí es el punto de partida de tu propia verificación, no una cotización.',
          'Si quieres probar el enfoque centrado en el programa sin gastar nada, el plan Gratis de Semora cubre un semestre de cuatro cursos con seguimiento completo de entregas y de calificaciones, y basta con una foto de un programa para ver si la extracción aguanta con tus propios documentos, que es la única prueba que importa.',
        ],
      },
    ],
    faq: [
      { question: '¿Cuál es la mejor app de estudio con IA para universitarios?', answer: 'No hay una sola respuesta, porque las apps resuelven tres problemas distintos. Si tu problema es que se te pasan las entregas, la solución es una app centrada en el programa como Semora o DormWay. Si tu problema es aprender el material antes de un examen, una app centrada en el material como StudyFetch, Mindgrasp o Studley AI genera tarjetas, apuntes y cuestionarios de lo que subes. Si tu problema es no empezar con tiempo, una app centrada en la agenda como Shovel te reserva las horas. Elige de la categoría que corresponda a la falla que te sigue pasando.' },
      { question: '¿Hay alguna app gratuita con IA que escanee programas de clase?', answer: 'Sí. DormWay es gratuita, no tiene plan de pago y analiza programas subidos en la app o enviados por correo a su dirección de recepción. Semora tiene un plan Gratis con cinco escaneos por mes calendario, hasta cuatro cursos en un semestre, seguimiento completo de entregas y de calificaciones con promedios ponderados, y recordatorios el mismo día. Las dos te dejan comprobar si la extracción funciona con tus propios programas antes de pagar nada.' },
      { question: '¿Una app con IA puede leer mi programa y agregar todas las fechas automáticamente?', answer: 'Las apps centradas en el programa hacen exactamente eso: extraen cada tarea, examen, cuestionario, proyecto y lectura con su fecha, y normalmente también las ponderaciones, los horarios de clase y las fechas del semestre. Lo que no pueden es resolver toda ambigüedad a la perfección. Los programas traen exámenes «por definir», entregas semanales escritas en una sola línea y fechas relativas a la sesión de clase. Por eso un paso de revisión antes de guardar importa más que el modelo que haya detrás.' },
      { question: '¿Necesito más de una app de estudio?', answer: 'A menudo sí, porque las categorías fallan en direcciones opuestas. Un generador de tarjetas no puede decirte cuándo es tu parcial, y una agenda no puede ayudarte a aprender el capítulo. La combinación habitual es una app que se haga cargo de la estructura del semestre y otra del material de estudio, o una sola que haga ambas desde la misma fuente, que es lo que hace Semora al generar tarjetas del programa y los apuntes que ya tiene.' },
      { question: '¿Cuánto cuestan las apps de estudio con IA?', answer: 'El rango de esta comparación va de gratis a unos $12.88 al mes. DormWay es gratuita sin plan de pago y myHomework es gratuita con anuncios. Semora Pro cuesta $3.99 al mes o $19.99 al año. Reseñas de terceros reportan Mindgrasp en aproximadamente $5.99–$10.99 al mes, StudyFetch en aproximadamente $7.99–$11.99 al mes, Shovel en $9.79 al mes o $39 al año, y Studley AI en $12.88 al mes o $97.76 al año. Varios proveedores no publican precios en sus propios sitios, así que confírmalo antes de comprar.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[7].path, SPANISH_BLOG_POSTS[7].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[7].title,
    metaDescription: SPANISH_BLOG_POSTS[7].description,
    h1: SPANISH_BLOG_POSTS[7].title,
    lede: 'La IA convierte tus apuntes en un mazo de tarjetas en segundos, y generar rara vez es la parte difícil: lo difícil es que un mazo de 120 tarjetas indiferenciadas es peor que 30 buenas, porque para el jueves habrás dejado de repasarlo.',
    intro: [
      'Cuatro cosas deciden si un mazo generado sirve de verdad: una idea por tarjeta (no un párrafo en el reverso), acotado a un examen concreto en vez de a todo el curso, verificado contra tus propios apuntes antes del primer repaso, y con un calendario de repetición espaciada para que las tarjetas que ya sabes dejen de robarle tiempo a las que no.',
      'Abajo está cómo generar un mazo, qué separa a una tarjeta buena de una mala, en qué se diferencian las herramientas según de dónde sale el material fuente, y cuándo las tarjetas de estudio son directamente la herramienta equivocada.',
    ],
    sections: [
      {
        heading: 'Por qué funcionan las tarjetas, y qué implica eso sobre cómo deben ser',
        paragraphs: [
          'Las tarjetas de estudio son un mecanismo de entrega de dos hallazgos bien establecidos, y saber cuáles son te dice cómo tiene que ser una tarjeta buena.',
          'El primero es la práctica de recuperación: el acto de sacar una respuesta de la memoria refuerza ese recuerdo más que volver a revisar el mismo material. Por eso una tarjeta con la respuesta visible en el anverso no es una tarjeta de estudio: es un apunte. El intento de recuperación es todo el mecanismo, y una tarjeta que no lo obliga no está haciendo nada.',
          'El segundo es el efecto de espaciamiento: la información repasada en intervalos crecientes se retiene bastante más tiempo que el mismo total de repaso concentrado de golpe. Por eso el calendario importa tanto como el mazo. Repasar 100 tarjetas una vez la noche anterior no es la misma intervención que repasar 30 tarjetas cinco veces a lo largo de dos semanas, aunque los minutos totales se parezcan.',
          'Los dos hallazgos tienen una consecuencia práctica que la mayoría de los mazos generados ignora. La recuperación solo funciona si hay una cosa específica que recuperar. Una tarjeta cuyo reverso tiene cuatro oraciones no se puede calificar con honestidad: vas a recordar a medias dos de ellas, te vas a dar por aprobado y vas a seguir adelante con un recuerdo que en realidad nunca se puso a prueba. Una idea por tarjeta no es una preferencia de estilo: es lo que hace que el paso de autocalificación signifique algo, y la autocalificación es lo que alimenta al algoritmo de programación.',
        ],
      },
      {
        heading: 'Paso a paso: de los apuntes a un mazo que sí vas a repasar',
        paragraphs: [
          'La mecánica es rápida. El criterio es donde se va el tiempo.',
          'El paso 5 es el que la gente se salta, y es el que separa un apoyo de estudio de una forma cara de memorizar errores. También va más rápido de lo esperado: estás verificando contra apuntes que tomaste tú, así que los errores tienden a saltar a la vista.',
        ],
        bullets: [
          'Reúne la fuente, y sé exigente con ella. Apuntes de clase, diapositivas, una lectura, un paquete de repaso del profesor. Mete el material que efectivamente te dijeron que había que saber, no todo lo que tienes. Un mazo generado de tres semanas de material tangencial serán tres semanas de tarjetas tangenciales.',
          'Acótalo a una sola evaluación. «Genera tarjetas de este curso» produce un mazo con material de un parcial que ya presentaste y de un final que está a nueve semanas. «Genera tarjetas para el cuestionario del jueves sobre los capítulos 4 a 6» produce algo que puedes terminar. Esta única decisión hace más por la utilidad de un mazo que cualquier ajuste de la instrucción.',
          'Genera y recorta de inmediato. Cuenta con borrar un tercio de lo que vuelva. Tarjetas que repiten una definición ya obvia, tarjetas sobre una nota al pie, pares casi idénticos que preguntan lo mismo de dos formas: todo eso es ruido que te cuesta tiempo de repaso en cada pasada.',
          'Arregla los reversos. Cualquier tarjeta cuya respuesta ocupe más de una o dos oraciones debería partirse en dos o reescribirse. Es la edición de mayor valor que puedes hacer y toma alrededor de un minuto por cada diez tarjetas.',
          'Verifica los datos contra tus apuntes. Las tarjetas generadas heredan lo que estuviera ambiguo o mal en la fuente, y agregan la posibilidad de una invención dicha con seguridad. Una tarjeta equivocada repasada en un calendario espaciado no es neutral: estás ensayando un error de forma sistemática.',
          'Repasa con un calendario, no en una sesión. Quince minutos en cinco días rinden más que setenta y cinco minutos en uno, y la diferencia no es pequeña.',
        ],
      },
      {
        heading: 'De dónde salen las tarjetas: las herramientas comparadas',
        paragraphs: [
          'La diferencia relevante entre herramientas de tarjetas no es la calidad de la generación: es a partir de qué se les permite generar, y si algo ata el mazo a tu curso real. Un mazo que sabe a qué examen pertenece puede acotarse a ese examen. Un mazo que no sabe que tus cursos existen solo puede acotarse al archivo que acabas de subir.',
          'La columna que cambia la experiencia diaria es la tercera. Con una herramienta centrada en el material, cada mazo empieza con una subida: buscas el archivo, lo subes, esperas y recibes tarjetas sobre ese archivo. Con una herramienta que ya tiene tu material de curso, la fuente ya está ahí, y la pregunta pasa a ser «¿qué examen?» en lugar de «¿qué archivo?». Los mazos de Semora se generan del programa que ya escaneó más los apuntes que hayas subido, y pueden apuntarse a un examen o cuestionario concreto de tus entregas registradas, para que un repaso de parcial no vuelva diluido con material del final. La contrapartida es honesta: las tarjetas son una función de Pro, a $3.99 al mes o $19.99 al año, mientras que el plan Gratis cubre solo las entregas y el seguimiento de calificaciones.',
        ],
        table: {
          columns: ['App', 'Genera tarjetas a partir de', '¿Conoce tus cursos?', 'Repetición espaciada', 'Precio'],
          highlightColumn: 0,
          caption: 'Recopilado de los materiales publicados por cada producto en agosto de 2026; las cifras señaladas como reportadas provienen de reseñas de terceros. Verifica el precio vigente con el proveedor.',
          rows: [
            ['Semora', 'Tu programa escaneado, los apuntes que subas y los paquetes de repaso adjuntos (PDF o foto), además de tarjetas manuales', 'Sí. Un mazo puede acotarse a todo el curso o a un examen o cuestionario concreto de tus entregas registradas', 'Sí', 'Pro: $3.99/mes o $19.99/año (el plan Gratis cubre entregas y calificaciones, no tarjetas)'],
            ['StudyFetch', 'Los materiales que subes, a través del tutor Spark.E', 'En parte. Puede extraer eventos de un programa fotografiado, por cada subida y no en todos los cursos a la vez', 'Sí: planes de estudio con repetición espaciada', 'Reportado en ~$7.99–$11.99/mes; plan gratuito reportado con 1 conjunto de estudio'],
            ['Mindgrasp', 'Un solo archivo subido: PDF, DOCX, PPT, MP3/MP4, YouTube o artículos web', 'No se encontró análisis de programas ni de fechas en sus materiales públicos', 'No está documentada como función de calendario', 'Reportado en ~$5.99–$10.99/mes; sin precios en su propio sitio'],
            ['Studley AI', 'PDF, diapositivas, videos de YouTube, enlaces a artículos y fotos de apuntes a mano', 'No. Mide el dominio del conjunto subido, no de un curso', 'Niveles de dominio, de desconocido a dominado', 'Gratis: 1 conjunto al día; reportado en $12.88/mes o $97.76/año'],
            ['DormWay', 'No se encontró generación de tarjetas en sus materiales públicos', 'Sí, para las fechas: analiza programas y sincroniza tres plataformas LMS', 'No aplica', 'Gratis, sin plan de pago'],
            ['myHomework', 'No tiene función de tarjetas', 'Solo fechas, por registro manual o importación desde el LMS', 'No aplica', 'Gratis con anuncios; versión sin anuncios reportada en unos $4.99/año'],
          ],
        },
      },
      {
        heading: 'Cómo decide la repetición espaciada cuándo vuelves a ver una tarjeta',
        paragraphs: [
          'La programación es la parte que hace el trabajo, y vale la pena entenderla porque explica comportamientos que de otro modo parecen fallas.',
          'Un sistema de repetición espaciada te pide calificar tu propio recuerdo después de cada tarjeta: a grandes rasgos, si la sacaste o no. Las que aciertas se empujan más hacia el futuro, y cada acierto estira el intervalo. Las que fallas vuelven pronto, a veces dentro de la misma sesión. En un par de semanas el mazo se ordena solo: el material que ya sabes desaparece de tu cola diaria y lo que queda se concentra en lo que sigues fallando.',
          'Esto produce dos efectos que sorprenden. Primero, la cola diaria se encoge aunque el mazo crezca, porque las tarjetas viejas ya se fueron a intervalos largos. Segundo, un día sin repasar sale caro, porque todo lo programado para ese día cae encima de la cola del día siguiente. El sistema está construido sobre el supuesto de contacto constante, que es justamente por lo que el tamaño del mazo importa tanto: un mazo de 300 tarjetas abandonado cuatro días produce un atraso que la mayoría prefiere abandonar antes que vaciar.',
          'La calificación honesta es la parte que sostiene todo. Marcar una tarjeta como sabida porque la reconociste es la forma en que un mazo se vuelve inútil en silencio: el algoritmo deja de mostrarte el material que no aprendiste, por tu propio reporte inexacto. Esta es la segunda razón para las tarjetas de una sola idea. Una tarjeta con cuatro datos en el reverso no tiene ninguna calificación honesta disponible —sabías una parte—, así que redondeas hacia arriba y el calendario se aleja de la realidad.',
          'Si estás encajando el repaso en los huecos entre clases, la técnica Pomodoro combina bien con esto: una cola de tarjetas es una de las pocas tareas de estudio que de verdad funciona en un bloque de quince minutos, porque retomarla no tiene costo de arranque.',
        ],
      },
      {
        heading: 'Los cinco errores de redacción que la IA comete de forma predecible',
        paragraphs: [
          'Los mazos generados fallan de maneras consistentes y reconocibles. Una vez que conoces los patrones, los detectas y los arreglas en una sola pasada.',
          'Ninguno de estos errores significa que no valga la pena usar la generación. Escribir 40 tarjetas a mano toma una hora; generar 60 y editarlas hasta dejar 40 toma quince minutos y produce un mazo mejor, porque editar es más fácil que redactar. El error es tratar el paso de «generar» como el paso final.',
        ],
        bullets: [
          'El reverso con párrafo. El fallo más común. El modelo resume un concepto entero en una tarjeta porque la fuente lo trataba en un solo lugar. Divídela: una tarjeta por afirmación, por paso, por término.',
          'El anverso que regala la respuesta. Una pregunta formulada con tanto detalle que la respuesta está contenida en el enunciado —«¿cómo se llama el proceso por el que las plantas convierten la luz en energía química?»— no evalúa nada. Recorta el anverso hasta que exija recuperar de verdad.',
          'La tarjeta de dato curioso. La generación no tiene forma de saber qué enfatizó tu profesor. Va a producir con gusto una tarjeta sobre una fecha mencionada una vez en un pie de imagen junto a otra sobre el mecanismo central del curso. Solo tú sabes cuál entra en el examen, y por eso importa la pasada de recorte del paso 3.',
          'El racimo de casi duplicados. Tres tarjetas que preguntan lo mismo con otras palabras. Cada una cuesta tiempo de repaso en cada pasada y ninguna agrega memoria. Quédate con la más clara y borra el resto.',
          'La invención dicha con seguridad. Más rara, y la más dañina: un dato verosímil que no aparece en ningún lugar de tus apuntes. Esta es la razón concreta para verificar las tarjetas contra tu propia fuente antes del primer repaso, y no después del primer mal cuestionario.',
        ],
      },
      {
        heading: 'Cuándo las tarjetas son la herramienta equivocada',
        paragraphs: [
          'Las tarjetas son excelentes para cosas con una respuesta correcta que cabe en una tarjeta: vocabulario, fórmulas, definiciones, fechas, mecanismos, clasificaciones, estructuras anatómicas, interacciones farmacológicas, formas de un idioma extranjero. Si tu examen consiste en buena medida en recordar datos discretos, un mazo bien mantenido está cerca de ser la actividad de estudio de mayor rendimiento disponible.',
          'Encajan mal en algunos casos, y forzarlas desperdicia el tiempo que creías estar ahorrando. Las materias de resolución de problemas —casi todas las matemáticas más allá de memorizar fórmulas, física, ingeniería, estadística— necesitan ejercicios resueltos, porque la habilidad que se evalúa es elegir y ejecutar un método, no recordar que el método existe. Una tarjeta que dice «¿cómo se integra por partes?» evalúa exactamente lo que no es. Los exámenes de ensayo y las materias basadas en argumentación necesitan práctica de construir argumentos, no de recuperar sus componentes. Y cualquier cosa que todavía no has leído no está lista para tarjetas: un mazo generado de un capítulo que te saltaste te va a enseñar el resumen y a darte la sensación segura de haber estudiado.',
          'También hay un argumento de calendario para no hacer un mazo. Si el cuestionario es mañana, la repetición espaciada no tiene espacio para operar: el efecto de espaciamiento necesita espaciamiento. En esa situación, una sola pasada concentrada por el material, autoevaluándote, rinde más que montar un sistema de repaso que nunca va a tener una segunda sesión.',
          'La regla general: usa tarjetas para lo que hay que saber, y ejercicios resueltos o práctica de escritura para lo que hay que hacer. La mayoría de las materias necesita las dos cosas, en una proporción que tus exámenes anteriores te van a indicar.',
        ],
      },
      {
        heading: 'Cómo encaja un mazo en un semestre real',
        paragraphs: [
          'La forma en que fracasan las tarjetas no son las tarjetas malas. Es un buen mazo armado en la semana 9 para un examen de la semana 10, que es exactamente cuando el espaciamiento se quedó sin margen para ayudar.',
          'La versión que funciona no es lucida: haz tarjetas a medida que se ve el material, en tandas pequeñas, y repásalas unos minutos casi todos los días. Un mazo armado en incrementos de quince minutos a lo largo del semestre está terminado antes de que anuncien el examen, y para entonces los repasos son cortos porque la mayoría de las tarjetas ya envejeció a intervalos largos. Un mazo armado en una sola sesión de pánico son 200 tarjetas que vas a ver exactamente dos veces.',
          'Ese calendario es el argumento práctico para generar tarjetas de material que la herramienta ya tiene, en vez de material que tienes que ir a buscar. Cuando el programa y los apuntes ya están en la app, «hacer tarjetas para el cuestionario de la próxima semana» es una decisión y no un proyecto, y la tanda ocurre en lugar de posponerse. Las tarjetas de Semora funcionan así: el material fuente ya está ahí desde el escaneo del programa y desde cualquier apunte que hayas subido, los mazos pueden acotarse a un examen o cuestionario concreto que tengas registrado, un paquete de repaso del profesor puede adjuntarse como PDF o foto para generar a partir de él, y las tarjetas manuales están soportadas para las que quieras escribir tú. El repaso funciona con repetición espaciada. Forma parte de Pro, a $3.99 al mes o $19.99 al año; el plan Gratis cubre el escaneo de programas, las entregas y el seguimiento de calificaciones.',
          'Sea cual sea la herramienta, la secuencia es la misma y el orden no es negociable: lee el material, genera a partir de lo que de verdad hay que saber, recorta y arregla lo que vuelva, verifícalo contra tus apuntes y repasa con un calendario. Sáltate los tres pasos del medio y el mazo es una forma de sentirte productivo. Hazlos y es una de las pocas técnicas de estudio con décadas de evidencia detrás.',
        ],
      },
    ],
    faq: [
      { question: '¿La IA puede hacer tarjetas de estudio a partir de mis apuntes de clase?', answer: 'Sí. Todas las herramientas de esta comparación aceptan material subido —PDF, diapositivas, apuntes y, en algunos casos, grabaciones y video— y devuelven tarjetas de pregunta y respuesta. Generar toma segundos. El trabajo que decide si el mazo sirve viene después: recortar las tarjetas que no evalúan nada, dividir cualquier tarjeta cuya respuesta ocupe más de una o dos oraciones, y verificar los datos contra tus propios apuntes antes del primer repaso.' },
      { question: '¿Cuántas tarjetas debería tener un mazo?', answer: 'Menos de las que te dará un generador. Un mazo de 30 tarjetas bien acotadas que repasas cinco veces rinde más que 120 tarjetas que repasas una, porque la repetición espaciada depende del contacto repetido y un mazo grande es lo que hace que la gente lo abandone. Acota el mazo a una sola evaluación —un cuestionario o examen concreto— en lugar de a todo un curso, y cuenta con borrar cerca de un tercio de lo que produzca el generador.' },
      { question: '¿La repetición espaciada de verdad rinde más que estudiar de golpe?', answer: 'Para retención a largo plazo, sí: el material repasado en intervalos crecientes se retiene bastante más tiempo que el mismo total de repaso comprimido en una sesión. El detalle es que el espaciamiento necesita margen. Si el examen es mañana, no queda espaciamiento que aprovechar, y una sola pasada concentrada con autoevaluación es mejor uso de la noche que montar un sistema de repaso que nunca tendrá una segunda sesión.' },
      { question: '¿Son precisas las tarjetas generadas con IA?', answer: 'En general sí, pero no lo bastante como para saltarse la verificación. Las tarjetas generadas heredan cualquier cosa ambigua o equivocada del material fuente, y de vez en cuando agregan un dato verosímil que no aparece en ningún lugar de tus apuntes. Eso importa más con tarjetas que con un resumen, porque una tarjeta equivocada repasada en un calendario espaciado significa que estás ensayando un error de forma sistemática. Verificar contra tus propios apuntes toma unos minutos y es el paso que separa un apoyo de estudio de un error memorizado.' },
      { question: '¿Sirven las tarjetas para matemáticas y materias de resolución de problemas?', answer: 'Solo para la capa de memorización: fórmulas, definiciones, teoremas con nombre, conversiones de unidades. La habilidad que evalúa de verdad un examen de matemáticas o física es elegir y ejecutar un método, y ninguna tarjeta puede ensayar eso. Una tarjeta que pregunta «¿cómo se integra por partes?» evalúa recordar que la técnica existe, no la capacidad de aplicarla. Para esas materias, los ejercicios resueltos son la actividad de estudio, con un mazo pequeño al lado para los datos que hay que tener a mano.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[8].path, SPANISH_BLOG_POSTS[8].englishPath, 'standard', {
    metaTitle: SPANISH_BLOG_POSTS[8].title,
    metaDescription: SPANISH_BLOG_POSTS[8].description,
    h1: SPANISH_BLOG_POSTS[8].title,
    lede: 'La nota que necesitas en un final es (objetivo − calificación actual × (1 − peso del final)) ÷ peso del final, donde cada número es un porcentaje y el peso del final sale de tu programa, no de una suposición.',
    intro: [
      'Si tu calificación actual es 88 %, el final vale 30 % y quieres terminar en 90 %, necesitas 94.7 %.',
      'La fórmula en sí es una línea. Los errores vienen de los datos que le metes: usar el promedio del sistema del curso cuando parte de la materia sigue sin calificar, olvidar que una categoría sin notas todavía no es un cero, ignorar el redondeo y los umbrales entre letras, y dar por hecha una curva que quizá no exista.',
      'Abajo están los ejemplos resueltos, una tabla de referencia y los cuatro fallos, en ese orden.',
    ],
    sections: [
      {
        heading: 'La fórmula',
        paragraphs: [
          'Llamemos T al porcentaje total con el que quieres terminar, C a tu calificación actual en la parte del curso que ya está calificada, y w al peso del examen final en decimal (30 % = 0.30).',
          'Nota que necesitas = (T − C × (1 − w)) ÷ w.',
          'La lógica es más simple que la notación. Todo lo que no es el final —es decir, (1 − w) del curso— ya está resuelto y aporta C × (1 − w) puntos a tu total. Réstalo de tu objetivo y te quedan los puntos que el final todavía tiene que aportar. Divide entre el peso del final para convertir esos puntos en un porcentaje sobre el examen mismo.',
          'El peso del final es una palanca en las dos direcciones. Un final más pesado hace más recuperable una calificación baja, y más fácil de perder una alta. Muchos estudiantes ven un final del 40 % como una amenaza; es igualmente una oportunidad, y la misma aritmética produce las dos lecturas.',
          'El resultado a menudo queda por encima de 100 o por debajo de 0, y ambos casos informan. Un resultado de 104 significa que el objetivo no es alcanzable, y es mejor saberlo una semana antes del examen que después. Un resultado de 12 significa que tu calificación está prácticamente asegurada y que tus horas de estudio rinden más en otra materia. Ninguno de los dos es un error de cálculo.',
        ],
      },
      {
        heading: 'Ejemplo 1: el caso directo',
        paragraphs: [
          'Tu programa dice que el final vale 30 % de la calificación del curso. Todo lo demás —tareas, dos parciales, participación— ya está calificado, y tu promedio en ese conjunto es 88 %. Quieres terminar el curso en 90 %.',
          'Sustituye: T = 90, C = 88, w = 0.30. El 70 % ya calificado aporta 88 × 0.70 = 61.6 puntos a tu total. Tu objetivo de 90 menos 61.6 deja 28.4 puntos que el final tiene que aportar. Y 28.4 ÷ 0.30 = 94.7 % en el examen final.',
          'Ahora corre los mismos números con objetivos menos ambiciosos. Para terminar en 80 %: (80 − 61.6) ÷ 0.30 = 18.4 ÷ 0.30 = 61.3 %. Para simplemente aprobar con 70: (70 − 61.6) ÷ 0.30 = 28 %.',
          'Ese rango —94.7 para sostener el nivel más alto, 61.3 para el intermedio, 28 para aprobar— es la información que de verdad sirve para decidir, y por eso calcular un solo objetivo suele ser un error. La distancia entre la nota que necesitas para la calificación que quieres y la que necesitas para la calificación con la que puedes vivir te dice cuánto de tu semana le corresponde a este examen frente a todo lo demás que tienes encima.',
        ],
      },
      {
        heading: 'Ejemplo 2: cuando parte del curso sigue sin calificar',
        paragraphs: [
          'Este es el caso que produce respuestas equivocadas, porque la fórmula simple asume que C cubre todo excepto el final. Normalmente no es así.',
          'Supón que el programa reparte el curso en tareas 20 %, parciales 30 %, participación 10 % y final 40 %. Llevas 92 % de promedio en tareas y 81 % en parciales. La participación todavía no se asigna. Quieres un 90 general.',
          'Trabaja en puntos y no en porcentajes, porque no todas las categorías están cerradas. Tareas: 92 × 0.20 = 18.4 puntos guardados. Parciales: 81 × 0.30 = 24.3 puntos guardados. Total guardado: 42.7 puntos de 100 posibles.',
          'La participación es el problema. Vale 10 puntos y no sabes cuántos vas a obtener. Tienes que suponer algo, y la suposición mueve la respuesta. Si supones el crédito completo (10 puntos): (90 − 42.7 − 10) ÷ 0.40 = 37.3 ÷ 0.40 = 93.3 %. Si supones 85 % de participación (8.5 puntos): (90 − 42.7 − 8.5) ÷ 0.40 = 38.8 ÷ 0.40 = 97.0 %.',
          'Una sola suposición sobre una categoría del 10 % movió la nota requerida casi cuatro puntos. La lección no es que una suposición sea la correcta: es que conviene correr la versión pesimista y planear contra ella, porque la optimista es la que produce sorpresas.',
          'Fíjate además en lo que no pasó: la participación nunca se trató como un cero. Una categoría sin calificar no es un cero, y meterla al cálculo como si lo fuera te habría dicho que necesitabas 118 % y que el curso ya estaba perdido. Tu calificación en curso a lo largo del semestre se calcula sobre los pesos que efectivamente ya se calificaron.',
        ],
      },
      {
        heading: 'Tabla de referencia: qué necesitas, según el peso del final',
        paragraphs: [
          'La tabla siguiente asume que llegas al final con un 85 % en la parte ya calificada del curso, y muestra qué tiene que ser el examen para tres objetivos habituales. Existe para hacer visible la forma de la relación: un final más pesado es a la vez más recuperable y más peligroso.',
          'Lee la primera columna de resultados y el punto salta a la vista: con un 85 de entrada, un final que vale 20 % no puede llevarte a un 90 por bien que te vaya, mientras que uno que vale 50 % sí puede, exigiendo un 95, es decir, exigiendo algo en lugar de algo imposible. Lee la última columna y el mismo peso que te rescataba se convierte en el riesgo: un final del 20 % pide un 10 para mantenerte sobre 70, mientras que uno del 50 % pide un 55. Los finales pesados amplifican lo que ocurra en esa sala.',
          'La consecuencia práctica: el momento de mirar esta tabla es la semana 3, no la semana 15. El peso del final está impreso en el programa desde el primer día y determina si tu calificación en esa materia se va a decidir de forma gradual o de un solo golpe. Eso cambia cuánto te cuesta realmente un mal parcial, y se puede saber meses antes de que importe.',
        ],
        table: {
          columns: ['Peso del examen final', 'Para terminar en 90 %', 'Para terminar en 80 %', 'Para terminar en 70 %'],
          highlightColumn: 1,
          caption: 'Asume un 85 % de promedio en la parte ya calificada del curso. Un resultado por encima de 100 % significa que el objetivo no es alcanzable solo con el final.',
          rows: [
            ['20 % de la calificación', '110 %: no alcanzable', '60 %', '10 %'],
            ['25 % de la calificación', '105 %: no alcanzable', '65 %', '25 %'],
            ['30 % de la calificación', '101.7 %: no alcanzable', '68.3 %', '35 %'],
            ['40 % de la calificación', '97.5 %', '72.5 %', '47.5 %'],
            ['50 % de la calificación', '95 %', '75 %', '55 %'],
          ],
        },
      },
      {
        heading: 'Las cuatro formas de equivocarse en este cálculo',
        paragraphs: [
          'Cada uno de estos errores produce un número que parece razonable y no lo es.',
        ],
        bullets: [
          'Usar el porcentaje de la plataforma del curso como C. El número que te muestra Canvas o Blackboard se calcula solo sobre el trabajo calificado y, según cómo lo haya configurado tu profesor, las tareas sin calificar pueden quedar excluidas, contarse como cero o tratarse de forma distinta entre dos materias. Si metes ese porcentaje en la fórmula sin saber qué convención lo produjo, estás calculando a partir de una incógnita. Vuelve a calcular desde las ponderaciones del programa y tus notas reales.',
          'Tratar los puntos extra como peso normal. Los puntos extra suman a lo que ganaste sin sumar al denominador: eso es lo que los hace extra. Cinco puntos extra sobre una categoría del 10 % no equivalen a una categoría del 10 % calificada en 150. Agrégalos como puntos de bonificación a tu total guardado, no como otra categoría ponderada.',
          'Ignorar el umbral y el redondeo. Un 89.5 que redondea a 90 en una materia es la letra inferior en otra, porque la política de redondeo la fija el profesor y suele estar en el programa en una línea que nadie lee. Si tu resultado cae a menos de un punto de un límite entre letras, busca esa línea antes de decidir cuánto vas a estudiar. La diferencia entre «necesito un 89» y «necesito un 89.5 sin redondear» es una diferencia real de preparación.',
          'Dar por hecha una curva. Las curvas son comunes en algunos departamentos e inexistentes en otros, y un profesor que la aplicó el semestre pasado no tiene ninguna obligación de repetirla. Calcula el número que necesitas sin curva. Si aparece una, es una ganancia inesperada; si planeaste con ella y no llega, en diciembre ya no hay paso de recuperación disponible.',
        ],
      },
      {
        heading: 'Qué apps calculan esto por ti',
        paragraphs: [
          'La aritmética cabe en una línea, así que el valor que agrega una app no es el cálculo: es conocer las ponderaciones y tus notas sin que las vuelvas a escribir, y actualizar la respuesta conforme llegan las calificaciones. Ahí es donde las herramientas realmente se diferencian.',
          'Una calculadora web suelta es perfectamente adecuada para responder la pregunta una vez. Lo que no puede hacer es responderla otra vez la semana próxima sin que vuelvas a escribir todo, ni responderla para cinco materias a la vez, que es la versión de la pregunta que de verdad decide cómo pasas la semana de finales. El seguimiento de calificaciones de Semora está en el plan Gratis, con las categorías ponderadas extraídas del programa por el mismo escaneo que produjo tus fechas de entrega, así que la calificación en curso existe sin configuración manual. La capa de proyección —calculadoras de escenarios para tu calificación final y una escala de calificación personalizable, por si los umbrales de tu profesor no coinciden con los predeterminados— forma parte de Pro, a $3.99 al mes o $19.99 al año. La calculadora de GPA gratuita del sitio resuelve la parte del semestre en el navegador si es todo lo que necesitas.',
        ],
        table: {
          columns: ['App', 'Lleva la calificación ponderada del curso', '¿Responde «qué necesito en el final»?', 'De dónde salen las ponderaciones', 'Precio'],
          highlightColumn: 0,
          caption: 'Recopilado de los materiales publicados por cada producto en agosto de 2026; las cifras señaladas como reportadas provienen de reseñas de terceros.',
          rows: [
            ['Semora', 'Sí, en el plan Gratis, con categorías ponderadas', 'Sí: Pro agrega escala de calificación y proyección, con calculadoras de escenarios para tu calificación final', 'Se extraen automáticamente del programa escaneado, junto con las fechas de entrega', 'Plan Gratis; Pro $3.99/mes o $19.99/año'],
            ['DormWay', 'Sí: una calculadora de GPA y calificaciones con categorías ponderadas', 'Sí: puedes ajustar las ponderaciones y probar escenarios', 'Su propio análisis del programa, más sincronización de solo lectura con Canvas, Blackboard y Moodle', 'Gratis, sin plan de pago'],
            ['Shovel', 'No está confirmado públicamente como función central', 'No está documentado: sus materiales públicos tratan de bloques de tiempo y planificación', 'No aplica', 'Reportado en $9.79/mes o $39/año'],
            ['StudyFetch', 'No es un libro de calificaciones dedicado', 'No: sus funciones de evaluación se centran en retroalimentación de ensayos y puntaje de simulacros', 'No aplica', 'Reportado en ~$7.99–$11.99/mes'],
            ['myHomework', 'No se describe como función central', 'No', 'No aplica', 'Gratis con anuncios; versión sin anuncios reportada en unos $4.99/año'],
            ['Una calculadora web suelta', 'No: olvida todo al cerrar la pestaña', 'Sí, para el único escenario que escribiste', 'Las escribes tú desde el programa, cada vez', 'Gratis'],
          ],
        },
      },
      {
        heading: 'Casos especiales que la fórmula no cubre',
        paragraphs: [
          'Cuatro situaciones habituales necesitan un ajuste antes de aplicar la fórmula.',
        ],
        bullets: [
          'Se elimina la nota más baja. Si tu programa descarta el cuestionario o la tarea con peor nota, recalcula el promedio de esa categoría sin ese puntaje antes de usarlo como C. Esto mueve el promedio de una categoría varios puntos con frecuencia, y en la dirección favorable.',
          'Cursos por puntos. Algunas materias se califican sobre un total de puntos en lugar de porcentajes ponderados: 1000 puntos en el semestre, con el final valiendo 250. Aplica la misma lógica en puntos: resta los puntos que ya ganaste de los que exige tu calificación objetivo, y el resto es lo que el final tiene que aportar de esos 250. Si el programa te da un total de puntos, úsalo directamente; convertir a porcentajes primero introduce redondeo sin ningún beneficio.',
          'Un final que puede reemplazar un parcial. Algunos profesores permiten que un buen final sustituya la nota de un parcial flojo. Eso cambia w y C al mismo tiempo y no se resuelve con una sola pasada por la fórmula: calcúlalo de las dos maneras, con y sin la sustitución, y usa el resultado más pesimista para planear.',
          'Mínimos obligatorios. Algunas materias exigen aprobar el examen final por separado para aprobar el curso, sin importar tu porcentaje general. Esto invalida todo lo anterior. Aparece en el programa, normalmente una sola vez, y conviene buscarlo expresamente, porque la fórmula te dirá con toda tranquilidad que un 28 alcanza cuando el piso real es un 60.',
        ],
      },
      {
        heading: 'Qué hacer cuando el número es imposible',
        paragraphs: [
          'Si la aritmética dice que necesitas un 104, el objetivo se acabó. Esa información sirve de verdad, y vale la pena actuar sobre ella en lugar de quedarse con ella encima.',
          'Corre la fórmula otra vez para la letra siguiente hacia abajo, y para la que sigue. Casi siempre hay un objetivo cómodamente alcanzable, y saber dónde está el límite real convierte una angustia difusa en un número concreto, que es más fácil de preparar y bastante más fácil de dejar de rumiar. Después revisa si queda algo abierto: puntos extra pendientes, una política de reescritura en un trabajo, una componente de participación que aún se está evaluando. Son cosas pequeñas, pero mueven el total de puntos guardados, que es la única parte de la ecuación que sigue bajo tu control antes del examen.',
          'Luego recalcula en tus otras materias, porque el sentido de saber que en una clase el objetivo alto quedó fuera de alcance es que las horas que ibas a gastar ahí ahora están disponibles donde el número sigue en juego. Esa reasignación es todo el valor práctico de hacer esta cuenta con tiempo, y es la razón para correrla en todas las materias a la vez y no solo en la que más ansiedad te da.',
        ],
      },
    ],
    faq: [
      { question: '¿Qué nota necesito en el final para sacar la calificación más alta?', answer: 'Usa (objetivo − calificación actual × (1 − peso del final)) ÷ peso del final, con todos los valores como porcentajes. Para un 90 %, con un 88 % de entrada y un final que vale 30 % del curso: (90 − 88 × 0.70) ÷ 0.30 = 94.7 %. Toma el peso del final de tu programa en lugar de suponerlo, porque ese número cambia la respuesta más que cualquier otro de la fórmula.' },
      { question: '¿Y si la fórmula dice que necesito más de 100 %?', answer: 'El objetivo está fuera de alcance solo con el final, y conviene saberlo temprano y no tarde. Corre la fórmula de nuevo para la calificación siguiente hacia abajo hasta encontrar una cómodamente alcanzable. Después revisa si queda algo abierto —puntos extra pendientes, una política de reescritura, una participación que aún se evalúa—, porque eso cambia tus puntos guardados, que son la única parte de la ecuación bajo tu control antes del examen.' },
      { question: '¿Puedo usar directamente el porcentaje que me muestra Canvas?', answer: 'No sin saber cómo está configurado. El porcentaje de una plataforma se calcula solo sobre el trabajo calificado y, según los ajustes de tu profesor, las tareas sin calificar pueden quedar excluidas, contarse como cero o tratarse de forma distinta entre materias. Meter ese número sin saber qué convención lo produjo es calcular a partir de una incógnita. Vuelve a calcular desde las ponderaciones del programa y tus notas reales.' },
      { question: '¿Cómo hago el cálculo si una categoría todavía no está calificada?', answer: 'Trabaja en puntos y no en porcentajes. Multiplica el promedio de cada categoría calificada por su peso para obtener los puntos guardados, después supón un valor para la categoría sin calificar y réstalo también. Corre la suposición pesimista, no la optimista: en un curso donde la participación vale 10 %, suponer crédito completo en vez de 85 % movió la nota requerida casi cuatro puntos. Y algo decisivo: una categoría sin calificar no es un cero; tratarla así te dirá que el curso está perdido cuando no lo está.' },
      { question: '¿Y si mi final puede reemplazar la nota de un parcial bajo?', answer: 'Eso cambia a la vez el peso del final y tu calificación actual, así que una sola pasada por la fórmula no lo resuelve. Calcúlalo dos veces, con y sin la sustitución, y planea contra el resultado más pesimista. Revisa además si el programa exige un mínimo obligatorio en el final, algo que algunas materias piden con independencia de tu porcentaje general y que invalida por completo la aritmética.' },
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
