import type { ReactNode } from 'react';
import type { NewPage } from './new-page-content';
import type { PageLongForm } from './page-content';
import { FEATURES_ES, type SpanishFeatureFact } from './es-facts';
import { ES_FEATURE_CONTENT } from './es-feature-content';

export type SpanishPageKind =
  | 'standard'
  | 'download'
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
  page('/es/descargar', '/download', 'download', {
    metaTitle: 'Descargar Semora — iPhone, iPad y web',
    metaDescription:
      'Instala Semora en iPhone y iPad, o ábrela en cualquier navegador. Una sola cuenta mantiene sincronizadas tus entregas, calificaciones y materias. Android, Apple Watch, Wear OS y Mac están en desarrollo.',
    h1: 'Una cuenta. Todos los dispositivos donde estudias.',
    lede:
      'Semora funciona hoy en iPhone, iPad y la web, y todo lo que agregas en uno aparece en los demás. Escanea un programa con el teléfono entre clases y el semestre completo ya está ahí cuando abres la computadora.',
    intro: [
      'No se trata de comodidad. Una entrega que no ves es una entrega que se te pasa, y los estudiantes no se quedan quietos: el programa llega como PDF a una laptop, el aviso tiene que sonar en un teléfono, y la revisión antes de clase pasa en lo que tengas en la mano.',
      'Por eso el producto es la cuenta, no la app. Inicias sesión una vez y cada superficie de abajo lee el mismo semestre.',
    ],
    sections: [
      {
        heading: 'Qué funciona en cada dispositivo',
        paragraphs: [
          'El estado real de cada superficie. Lo que dice «en desarrollo» es exactamente eso: se está construyendo y no tiene fecha anunciada. Preferimos decirlo aquí antes de que lo descubras cuando ya organizaste tu semestre.',
        ],
        table: {
          columns: ['Dispositivo', 'Estado', 'Qué obtienes'],
          rows: [
            ['iPhone', 'Disponible', 'La app completa: escaneo con cámara, avisos, calificaciones, tarjetas y tutor con IA'],
            ['iPad', 'Disponible', 'La misma descarga universal, adaptada a la pantalla grande'],
            ['Web', 'Disponible', 'Cualquier navegador, también en Android y Mac. Arrastra un PDF a la página'],
            ['Widget de pantalla de inicio', 'Disponible', 'Lo que vence hoy, en la pantalla de inicio del iPhone y del iPad'],
            ['Android', 'En desarrollo', 'La misma cuenta y el mismo semestre, sin fecha anunciada'],
            ['Apple Watch', 'En desarrollo', 'Tu próxima entrega de un vistazo'],
            ['Wear OS', 'En desarrollo', 'La misma mirada rápida en un reloj Android'],
            ['Mac', 'En desarrollo', 'Una ventana de escritorio; hoy lo cubre la app web'],
          ],
        },
      },
      {
        heading: 'No pagas Semora dos veces',
        paragraphs: [
          'Pro es un permiso de la cuenta, no una licencia por dispositivo. Págalo con tarjeta en la web o desde la App Store en la app de iOS, y aplica en todo lugar donde inicies sesión: iPhone, iPad y navegador, incluido cualquier dispositivo que agregues después.',
          'El plan gratuito funciona igual en todas las superficies: avisos el mismo día, materias y tareas manuales sin límite, seguimiento de calificaciones y una acción de IA gratis en la cuenta.',
        ],
      },
      {
        heading: 'Cómo llevarla al dispositivo correcto',
        paragraphs: [
          'Si estás leyendo esto en una laptop, apunta la cámara del teléfono al código que está junto a la tarjeta de iPhone: abre directamente la ficha de la App Store, sin escribir nada ni buscar en una tienda que te mostrará otras cuatro apps primero.',
          'Si lo lees en el teléfono, los botones van directo. Y si quieres empezar ahora mismo sin instalar nada, la app web se abre en el navegador que ya tienes abierto.',
        ],
      },
    ],
    faq: [
      {
        question: '¿Hay app de Android?',
        answer:
          'Todavía no. Existe una versión de Android en la que estamos trabajando, pero no se ha publicado y no anunciamos fecha hasta que se pueda instalar. Mientras tanto la app web funciona completa en Chrome para Android —la misma cuenta, el mismo semestre, las mismas entregas— y todo lo que configures ahí ya estará esperándote cuando llegue la app.',
      },
      {
        question: '¿Se sincronizan mis datos entre el teléfono y la computadora?',
        answer:
          'Sí. Materias, tareas, fechas de entrega, calificaciones y tarjetas viven en tu cuenta y no en un dispositivo, y los cambios se propagan casi en tiempo real. Marca una tarea al salir de clase desde el teléfono y aparecerá marcada en la pestaña que dejaste abierta.',
      },
      {
        question: '¿Tengo que pagar otra vez en un segundo dispositivo?',
        answer:
          'No. Pro se compra una vez y aplica a toda la cuenta. Una suscripción hecha en la app de iOS también desbloquea la web, y una comprada con tarjeta en la web también desbloquea el iPhone y el iPad.',
      },
      {
        question: '¿Qué no puede hacer la app web?',
        answer:
          'Las diferencias son las que dependen del hardware. En el navegador no hay captura con cámara, así que arrastras un PDF, subes una imagen o pegas el texto; no hay widgets de pantalla de inicio; y no hay sincronización con el calendario del dispositivo, aunque la exportación .ics sí funciona. Todo lo demás —escaneo, calificaciones, planificación, tarjetas y el tutor con IA— está ahí.',
      },
    ],
  }),
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
        heading: 'El problema para el que se construyó',
        paragraphs: [
          'Las fechas de un semestre llegan repartidas: un PDF adjunto en un correo, una página del campus virtual, un anuncio en clase que no se escribió en ninguna parte. Ninguna de esas fuentes está en un formato con el que se pueda planificar, y reunirlas es un trabajo manual que hay que repetir cada periodo.',
          'El resultado habitual no es que se olvide una entrega suelta. Es que se descubren tres a la vez, en la semana seis, junto con un proyecto que valía más de lo que uno recordaba. No es un fallo de esfuerzo: la información estaba dispersa entre demasiados documentos.',
          'Semora empieza por el documento que ya contiene el semestre entero —el programa de cada materia— y lo convierte en cursos, entregas, horarios y ponderaciones que se pueden revisar. A partir de ahí, el calendario, los recordatorios, las calificaciones y la planificación trabajan con el contexto académico correcto en lugar de con una lista vacía.',
        ],
      },
      {
        heading: 'Por qué parte del programa y no de la plataforma académica',
        paragraphs: [
          'Es la decisión de diseño más importante del producto, y merece explicarse.',
          'Una conexión con el campus virtual refleja lo que el profesor publica dentro de la plataforma. El programa, en cambio, es donde suelen vivir las ponderaciones de la nota, las fechas de examen, el calendario de lecturas, las horas de atención y la escala de calificación. Buena parte de eso nunca llega a convertirse en una entrada de la plataforma.',
          'Hay además una razón práctica: no todo el mundo puede conectar su plataforma. Algunas instituciones desactivan la creación de tokens de acceso y otras prohíben su uso por terceros. Un producto que dependiera de esa conexión dejaría fuera a una parte de sus usuarios sin alternativa.',
          'Por eso la importación desde Blackboard y Moodle existe como complemento de Pro, mientras que Canvas es gratis, y no como puerta de entrada. La vía gratuita —escanear el programa o pegar el texto— funciona para cualquiera.',
        ],
      },
      {
        heading: 'Nada extraído por IA se guarda sin revisión',
        paragraphs: [
          'Es un principio, no una función. El curso, sus horarios y su escala de calificación se archivan al crear el curso, pero ninguna entrega se guarda hasta que la persona mira la lista y la aprueba.',
          'La pantalla de revisión hace además tres cosas concretas: marca para verificar lo que el modelo devolvió con menos confianza, señala las fechas que caen fuera del rango del semestre, y separa los elementos que llegaron sin fecha en lugar de asignarles una.',
          'El razonamiento es que una fecha equivocada en la que confías cuesta más que una fecha que nunca tuviste. Una IA que archiva en tu nombre sin enseñarte lo que archivó traslada el riesgo al usuario y se queda con la comodidad.',
        ],
      },
      {
        heading: 'Dónde viven tus datos y quién puede leerlos',
        paragraphs: [
          'Los datos académicos viven en el servidor, en una base de datos con seguridad a nivel de fila: las políticas se aplican por usuario en la propia base, no solo en la interfaz.',
          'Los archivos que subes —programas, apuntes— van a un almacenamiento privado, archivados bajo tu propio identificador de usuario. No se procesan en el dispositivo: el servidor los lee cuando un escaneo, una generación de tarjetas o una consulta al Tutor los necesita, y extrae el texto conservando la estructura.',
          'Una cuenta funciona en iPhone, iPad y la web con una sola base de datos, de modo que no hay una copia principal en un dispositivo concreto ni un paso de exportar e importar para cambiar de aparato. La política de privacidad, enlazada en el pie de cada página, es la declaración autoritativa sobre el tratamiento de datos.',
          'Borrar la cuenta es una ruta real dentro de la app y elimina la cuenta y los datos asociados. Que exista esa salida forma parte de poder confiar en la entrada.',
        ],
      },
      {
        heading: 'Los límites se aplican en la base de datos, no solo en la pantalla',
        paragraphs: [
          'El tope de un semestre en el plan Gratis no es un detalle de la interfaz. Está aplicado tanto en el cliente como por un disparador en la propia base de datos, de modo que una cuenta gratuita no puede iniciar un segundo periodo por ninguna vía.',
          'Lo mismo ocurre con las funciones de Pro. Alojar un Espacio de curso y la importación desde plataformas académicas se comprueban en el servidor y devuelven un error explícito, no solo un botón atenuado.',
          'Se menciona aquí porque afecta a lo que este sitio puede prometer honestamente. Un límite que solo existe en la interfaz es una sugerencia; uno que existe en la base de datos es un hecho, y solo los segundos merecen escribirse como tales en una página de precios.',
        ],
      },
      {
        heading: 'El criterio editorial de este sitio',
        paragraphs: [
          'Las cifras que aparecen en semoraai.com son afirmaciones sobre software real, y se tratan como tales. Cada límite, precio y nivel de plan se verifica contra el código que se ejecuta antes de escribirse, y hay una comprobación automática que falla si la web afirma algo que la app no implementa.',
          'Esa comprobación existe porque hizo falta. En su momento el sitio anunció una prueba gratuita que no existía, describió la importación desde Canvas como gratuita cuando entonces era de Pro, y decía que no había app para iPad cuando el binario es universal. Los tres errores estuvieron publicados y los encontró una persona leyendo, no una herramienta.',
          'El resto del criterio es igual de simple: no se inventan valoraciones ni testimonios, no se afirma el comportamiento de un competidor sin fuente pública, y cuando algo no está confirmado se dice que no lo está.',
          'Cuando una función no encaja con alguien, esta web lo dice. Hay una sección de «para quién no sirve» en casi todas las páginas largas, y no es modestia: un usuario que se instala la app esperando algo que no hace se marcha, y con razón.',
        ],
      },
      {
        heading: 'Cómo se paga Semora',
        paragraphs: [
          'Con suscripciones, y nada más. No hay publicidad, no se venden datos, y no hay una capa gratuita financiada por algo que no se ve.',
          'El plan Gratis incluye una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento, lo que necesites primero—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre, y un semestre en total, con seguimiento de entregas, calificaciones ponderadas y recordatorios el mismo día. No es una prueba que caduca.',
          'Pro cuesta 3,99 USD al mes o 19,99 USD al año, se compra con tarjeta en la web mediante Stripe o dentro de la app de iOS a través de la App Store, y se aplica a toda la cuenta, incluida la web. Se paga una sola vez: no hay una versión que haya que pagar dos veces.',
          'Si la suscripción caduca, la cuenta y los datos académicos se mantienen: se conserva todo lo del plan Gratis, la sincronización con el calendario se pausa en lugar de borrar los eventos que creó, y los Espacios de curso que alojas no desaparecen.',
        ],
      },
      {
        heading: 'Nuevo, pequeño, y cómo llegar a quien lo construye',
        paragraphs: [
          'Semora es un proyecto reciente y pequeño. Eso tiene consecuencias en las dos direcciones y conviene decirlas.',
          'En contra: hay menos funciones que en productos con años de recorrido, algunas rutas todavía tienen aristas, y no hay un equipo de soporte por turnos. La conexión con Canvas depende de un token y de la política de cada institución, que es una limitación real y no una preferencia.',
          'A favor: un correo llega a la persona que escribe el código, y una corrección concreta suele poder aplicarse en días y no en trimestres. Buena parte de lo que hoy hace la app salió de mensajes de estudiantes describiendo el caso exacto en el que fallaba.',
          'Si algo no funciona, o si tu programa se extrajo mal, escribir con el detalle concreto —qué materia, qué esperabas, qué salió— es la vía más rápida. La dirección de soporte está en el pie de cada página y en la sección de ayuda.',
        ],
      },
    ],
    faq: [
      { question: '¿Semora es una escuela o plataforma LMS?', answer: 'No. Semora es una herramienta personal para organizar la información de tus cursos. Complementa Canvas, Blackboard o Moodle; no reemplaza la fuente oficial de tu institución.' },
      { question: '¿Quién puede usar Semora?', answer: 'Está pensado principalmente para estudiantes universitarios que llevan varias materias, fechas de entrega y sistemas de calificación.' },
      { question: '¿Dónde puedo usarlo?', answer: 'En iPhone, iPad y en la web con la misma cuenta, sincronizadas en tiempo real. En iPhone hay además un widget en la pantalla de inicio con lo siguiente que vence.' },
    ],
  }),
  page('/es/precios', '/pricing', 'pricing', {
    metaTitle: 'Precios de Semora',
    metaDescription: 'Empieza gratis. Semora Pro cuesta $3.99 al mes o $19.99 al año e incluye planificación, IA, LMS y herramientas avanzadas.',
    h1: 'Precios simples para un semestre real',
    lede: 'Empieza gratis con lo esencial. Pásate a Pro cuando necesites cursos ilimitados, planificación adaptativa y herramientas de estudio avanzadas.',
    intro: [
      'El plan Gratis incluye una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, además de tareas, fechas de entrega, calificaciones ponderadas y recordatorios el mismo día. No necesitas tarjeta de crédito.',
      'Pro cuesta $3.99 al mes o $19.99 al año. Puedes contratarlo con tarjeta en la web o desde la app con tu Apple ID, y usarlo con la misma cuenta en iPhone, iPad y el navegador.',
    ],
    sections: [
      {
        heading: 'Qué incluye el plan Gratis, sin letra pequeña',
        paragraphs: [
          'El plan Gratis no es una prueba que caduca ni una versión recortada que deja de funcionar. Es un plan permanente con tres topes concretos y todo lo demás completo.',
          'Los topes son: una acción de IA para toda la vida de la cuenta (un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento, la que gastes primero), clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre, y un semestre en total. Dentro de eso tienes la capa de organización íntegra: seguimiento completo de entregas y tareas, calificaciones con medias ponderadas —incluidas categorías, descartes y las tres políticas de crédito extra—, recordatorios el mismo día, y la posibilidad de unirte al Espacio de curso de un compañero.',
          'Merece subrayarse que el motor de calificaciones entero está en el plan Gratis. No es una versión simplificada: es el mismo cálculo ponderado, con las mismas categorías y las mismas letras derivadas de la escala del curso, que usa una cuenta de pago.',
        ],
        bullets: [
          '1 acción de IA para toda la vida de la cuenta: un escaneo, una clase grabada o unos apuntes',
          'Hasta clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre',
          'Un semestre en total',
          'Entregas, tareas, calificaciones ponderadas y recordatorios el mismo día, completos',
          'Sin tarjeta de crédito',
        ],
      },
      {
        heading: 'Los dos límites que funcionan distinto',
        paragraphs: [
          'El de cursos y el de semestres se parecen sobre el papel y se comportan de forma muy diferente en la práctica.',
          'El curso que añades a mano es un techo sobre cuánto puedes escribir tú dentro de un mismo periodo; lo que llega de Canvas no cuenta y no tiene tope. Si llevas cinco materias, la quinta no cabe, y la decisión es cuál dejar fuera.',
          'Un semestre es una línea más dura. Una cuenta gratuita no puede iniciar un segundo periodo en absoluto, y eso está aplicado en la propia base de datos, no solo en la pantalla. La consecuencia importa: el tope no se renueva solo en enero, así que quien termine un periodo con el plan Gratis y quiera preparar el siguiente se encuentra ahí con el límite.',
          'Se dice aquí porque «un curso a mano por semestre» se lee, con razón, como si los periodos fueran rotando. No lo hacen.',
        ],
      },
      {
        heading: 'Qué añade Pro',
        paragraphs: [
          'Pro quita los tres topes y añade la capa de automatización y estudio construida sobre los mismos datos.',
          'La parte de organización: cursos y semestres ilimitados, sin tope de escaneos ni de grabaciones de clase, importación desde Canvas, Blackboard y Moodle donde tu institución lo permita, sincronización con el calendario del dispositivo con exportación .ics, y recordatorios con antelación de uno y tres días.',
          'La parte de planificación: el Plan Inteligente, que reparte sesiones de estudio con día, hora y duración en un horizonte de catorce días alrededor de tus clases; y la vista de carga académica, que señala las semanas cargadas y densas en exámenes con semanas de antelación.',
          'La parte de estudio y calificación: Tarjetas de estudio generadas a partir del programa y tus apuntes con repaso espaciado, el temporizador de enfoque, el Tutor con IA anclado a tu material real, la escala de calificación editable con calculadoras de hipótesis, las alertas de riesgo académico, las tendencias de progreso con exportación CSV y vista de impresión, y alojar tus propios Espacios de curso.',
        ],
      },
      {
        heading: 'Precio, dónde se compra y por qué eso importa',
        paragraphs: [
          'Pro cuesta 3,99 USD al mes o 19,99 USD al año. El plan anual sale a unos 1,67 USD al mes, algo menos de la mitad del mensual.',
          'Puedes comprar de dos formas: con tarjeta en app.semoraai.com, mediante Stripe, o dentro de la app de iOS a través de la App Store. Lo que compres se aplica a toda la cuenta.',
          'Da igual dónde pagues: una vez activa, la suscripción vale para toda la cuenta, iPhone, iPad y web. No hay dos productos ni dos pagos.',
          'Si compraste con tarjeta, se cancela desde Ajustes en Semora, en Gestionar plan de Semora. Si compraste en la App Store, se cancela desde Ajustes, tu nombre, Suscripciones, al menos 24 horas antes de que termine el periodo. Las renovaciones son automáticas hasta que canceles.',
        ],
        bullets: [
          '3,99 USD al mes o 19,99 USD al año (unos 1,67 USD al mes en el anual)',
          'Se compra con tarjeta en la web o en la app de iOS; se aplica a toda la cuenta',
          'Se cancela desde Ajustes en Semora, o desde tu Apple ID si compraste en la App Store',
        ],
      },
      {
        heading: 'Qué pasa si dejas de pagar',
        paragraphs: [
          'Es la pregunta que conviene hacerse antes de suscribirse y no después, así que aquí está la respuesta concreta.',
          'Tu cuenta y tus datos académicos se mantienen intactos y conservas todo lo del plan Gratis: las entregas siguen editables y las calificaciones siguen calculándose. Lo que se apaga son las funciones de Pro.',
          'Dos comportamientos específicos: la sincronización con el calendario del dispositivo se pausa en lugar de borrar los eventos que ya había creado, y los Espacios de curso que alojas no desaparecen —las fechas que ya publicaste siguen publicadas para quienes se unieron.',
          'Y las exportaciones existen mientras eres Pro: informe del semestre en CSV, vista para imprimir y un archivo .ics del curso. Si estás valorando marcharte, esa es la vía para llevarte el periodo contigo.',
        ],
      },
      {
        heading: 'Quién no necesita Pro',
        paragraphs: [
          'Vale la pena decirlo en una página de precios. Si llevas cuatro materias o menos en un solo periodo y lo que necesitas es no perder fechas y saber tu nota, el plan Gratis hace ese trabajo completo y no hay motivo para pagar.',
          'Pro empieza a tener sentido en tres situaciones concretas. La primera es el volumen: cinco o más materias, o querer llevar más de un periodo. La segunda es que tu problema no sea la memoria sino la asignación de tiempo, que es lo que resuelven el Plan Inteligente y la carga académica. La tercera es querer que las entregas entren desde Canvas en lugar de desde el programa, si tu institución lo permite.',
          'Si lo que buscas es únicamente generar material de estudio a partir de una lectura, hay herramientas centradas en eso que probablemente lo hagan mejor, y usar dos productos suele salir bien y no caro.',
        ],
      },
    ],
    faq: [
      { question: '¿Semora tiene un plan gratis?', answer: 'Sí. Incluye una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, además de seguimiento de entregas y calificaciones y recordatorios el mismo día. Una cuenta gratuita no puede iniciar un segundo periodo.' },
      { question: '¿Cómo compro Pro?', answer: 'Con tarjeta en app.semoraai.com, o dentro de la app en iPhone o iPad mediante la App Store. En ambos casos la suscripción se activa en toda tu cuenta.' },
      { question: '¿Puedo cancelar cuando quiera?', answer: 'Sí. Si pagaste con tarjeta, cancela desde Ajustes en Semora. Si compraste en la App Store, desde la configuración de tu Apple ID.' },
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
        heading: 'Empezar: del programa al semestre en unos minutos',
        paragraphs: [
          'El recorrido de entrada tiene tres pasos y ninguno necesita configuración previa. Crea la cuenta, abre la pestaña de escaneo y añade el programa de una materia: con una foto, subiendo el PDF, arrastrándolo en la web o pegando el texto.',
          'En unos segundos verás una lista con el curso, el profesor, los horarios, la escala de calificación y cada entrega con su fecha y su ponderación. Revísala. Lo marcado para verificar es lo que el modelo devolvió con menos confianza, y los elementos sin fecha quedan aparte hasta que los completes.',
          'Al aprobar, las entregas pasan a la vista Hoy y al Calendario, y los recordatorios del mismo día se programan solos. Repite con las demás materias. Cuatro programas suelen ser unos veinte minutos, y la mayor parte de ese tiempo es la revisión, que es la parte que conviene no apurar.',
        ],
        bullets: [
          'Empieza por la materia cuyas fechas tengas menos claras',
          'Un escaneo con foto de hasta 5 páginas cuenta como uno solo',
          'Puedes crear un curso a mano si su programa no trae fechas',
        ],
      },
      {
        heading: 'Editar lo que ya está dentro',
        paragraphs: [
          'Todo lo que entró por un escaneo se puede corregir después, y corregirlo no rompe nada de lo que hay encima.',
          'Toca una entrega para ver su detalle y edítala para cambiar el título, la fecha, la hora, el tipo o la descripción. El tipo importa más de lo que parece: alimenta la puntuación de carga académica y la estimación de esfuerzo del Plan Inteligente, así que marcar un examen como examen cambia cómo se planifica.',
          'Los horarios de clase y la escala de calificación se editan desde la pantalla del curso. Conviene saberlo porque un reescaneo no los sobrescribe: si tu profesor publica una versión revisada del programa, las entregas nuevas entran solas, pero el aula nueva o la ponderación cambiada las actualizas tú desde ahí.',
        ],
      },
      {
        heading: 'Recordatorios y notificaciones',
        paragraphs: [
          'El plan Gratis programa recordatorios el mismo día en cuanto apruebas las fechas. Pro añade avisos de un día y de tres días de antelación.',
          'Si no te llega ninguno, la causa casi siempre está fuera de la app: comprueba los permisos de notificaciones del sistema para Semora y que el modo de concentración no las esté silenciando. Una entrega sin hora concreta se avisa según su fecha, no según una hora que nadie fijó.',
          'La diferencia entre el mismo día y tres días importa según el tamaño del trabajo. Para una entrega corta, avisar por la mañana basta. Para un proyecto de seis horas, enterarte ese día no cambia nada: los tres días son la ventana en la que todavía se puede reaccionar.',
        ],
      },
      {
        heading: 'Cómo se calcula tu nota',
        paragraphs: [
          'La media es la suma ponderada de tus notas dividida entre el peso que has cursado, no entre el peso total del semestre. Por eso una asignatura con solo tres trabajos corregidos da una cifra sobre esos tres, y un examen final sin calificar que vale el 30 % no arrastra tu nota de octubre hacia cero.',
          'Puedes introducir las notas por puntos —lo obtenido sobre lo posible— o por porcentaje. El total de puntos posibles es el valor bruto del trabajo, nunca su peso en el curso: un parcial que vale el 20 % de la nota puede estar puntuado sobre 50.',
          'Si tu programa reparte la nota por categorías —Tareas 25 %, Cuestionarios 15 %, Exámenes 45 %, Proyecto 15 %— configúralas en la pantalla de calificación del curso. Los pesos deben sumar exactamente 100 para poder guardar, y el error te dice cuánto suman ahora mismo. Ahí también se configura descartar las notas más bajas, de 0 a 20 por categoría, que nunca elimina tu única nota registrada.',
          'Si tu profesor no publica ponderaciones y aun así has registrado notas, Semora usa un promedio simple en lugar de no mostrar nada. Es menos preciso, y es la respuesta honesta cuando el programa no da otra.',
        ],
      },
      {
        heading: 'Semestres, cursos y los límites del plan Gratis',
        paragraphs: [
          'Los semestres se gestionan desde la pestaña de cursos, con el selector de periodo: ahí se crean, se cambian y se administran.',
          'En el plan Gratis hay dos límites que funcionan distinto y conviene entender antes de tropezarse con ellos. El curso que añades a mano es un techo sobre cuánto puedes escribir tú dentro de un mismo periodo; lo que llega de Canvas no cuenta y no tiene tope. Un semestre es una línea más dura: una cuenta gratuita no puede iniciar un segundo periodo en absoluto, así que el tope no se renueva solo al empezar el año.',
          'Pro elimina ambos junto con el límite de una sola acción de IA. Si estás terminando un periodo y quieres preparar el siguiente, ese es el momento en el que el límite de semestres se nota.',
        ],
      },
      {
        heading: 'Suscripción: comprar, restaurar y cancelar',
        paragraphs: [
          'Pro se puede comprar con tarjeta en app.semoraai.com, mediante Stripe, o dentro de la app de iOS a través de la App Store. En los dos casos se aplica a toda tu cuenta, así que solo pagas una vez.',
          'Si pagaste con tarjeta, la suscripción se gestiona y se cancela desde Ajustes en Semora, en Gestionar plan de Semora. Si compraste en la App Store, se gestiona desde tu Apple ID: en Ajustes, tu nombre, Suscripciones, y hay que cancelar al menos 24 horas antes de que termine el periodo.',
          'Si has pagado y la app no te reconoce como Pro, comprueba que has entrado con la misma cuenta de Semora con la que pagaste; si compraste en la App Store, usa además la opción de restaurar compras dentro de la app, con el mismo Apple ID. Si sigue sin aparecer, escribe a soporte con la fecha aproximada de la compra.',
          'Al cancelar, tu cuenta y tus datos académicos se mantienen intactos y conservas todo lo del plan Gratis. Lo que se apaga son las funciones de Pro; la sincronización con el calendario se pausa en lugar de borrar los eventos que ya había creado.',
        ],
      },
      {
        heading: 'Cuando algo sale mal',
        paragraphs: [
          'Si un programa se extrajo mal, lo más útil es decir qué materia, qué esperabas y qué salió. Los formatos de programa varían enormemente entre profesores y ese detalle concreto es lo que permite corregir el caso.',
          'Si un escaneo falla o se queda a medias, comprueba que el documento sea legible: una foto torcida, oscura o desenfocada es la causa más frecuente. Para un programa largo, subir el PDF da mejor resultado que fotografiarlo, porque el PDF se lee completo y sin tope de páginas. En la web, pegar el texto es la vía más precisa de todas.',
          'Si la conexión con Canvas deja de funcionar, lo normal es que el token haya caducado o se haya revocado: la conexión aparecerá marcada como que necesita atención. Vuelve a conectarla solo si tu institución permite el uso de tokens por terceros; si no, escanea el programa o pega la lista de tareas.',
          'Para borrar la cuenta, la ruta está dentro de la app en la pestaña de perfil, al final. Elimina la cuenta y los datos asociados de forma permanente.',
        ],
      },
    ],
    faq: [
      { question: '¿Cómo añado el programa de una materia?', answer: 'Abre Escanear y toma una foto, sube un PDF o elige un archivo. En la web también puedes arrastrarlo o pegar el texto. Revisa el resultado antes de guardarlo.' },
      { question: '¿Puedo editar una tarea después?', answer: 'Sí. Abre la tarea y elige Editar para cambiar el título, la fecha, la hora, el tipo o la descripción.' },
      { question: '¿Cómo se calcula mi calificación?', answer: 'Semora usa las puntuaciones y ponderaciones que registras. El promedio actual solo toma en cuenta lo que ya está calificado.' },
      { question: '¿Cómo cancelo Pro?', answer: 'Depende de cómo pagaste. Si fue con tarjeta, abre Ajustes en Semora y entra en Gestionar plan de Semora. Si compraste en la App Store, abre Configuración > Apple ID > Suscripciones y selecciona Semora, al menos 24 horas antes de que termine el periodo.' },
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
          'Grabaciones de clase, si decides grabar: el audio capta la voz de tu profesor y de quienes estén cerca. Se guarda en privado solo hasta transcribirse y después se elimina automáticamente. La grabación nunca empieza hasta que pulsas Grabar y confirmas que tienes permiso.',
          'Transcripciones de clase y el material de estudio generado a partir de ellas (apuntes, cuestionarios y tarjetas), que permanecen hasta que elimines la grabación o tu cuenta.',
          'Datos de uso anónimos asociados a un identificador aleatorio, no a tu nombre ni a tu correo electrónico. En este sitio web ese identificador se guarda en una cookie propia llamada semora_device_id, en semoraai.com, para que el sitio y la aplicación reconozcan el mismo navegador y podamos saber si una página realmente ayudó a alguien a empezar. Es un número aleatorio, nunca se vende y se borra al borrar los datos de tu navegador. El sitio web también usa Google Analytics, que instala sus propias cookies propias (sus nombres empiezan por _ga) para contar visitas y distinguir una visita de otra; el identificador semora_device_id no se envía a Google, de modo que ambas mediciones no pueden combinarse en un perfil tuyo. No instalamos ninguna cookie publicitaria en los sitios de Semora y nada de lo que medimos se usa para publicidad personalizada.',
          'Un identificador para enviar notificaciones si autorizas los recordatorios y datos de referidos si utilizas una invitación.',
        ],
      },
      {
        heading: 'Cómo usamos la información',
        paragraphs: ['Usamos tus datos para organizar tareas, calificaciones y calendarios; extraer información de los programas de clase; enviar recordatorios; sincronizar los cursos que elijas; ofrecer tarjetas de estudio, planificación y el Tutor con IA; transcribir las clases que decides grabar y generar apuntes, cuestionarios y tarjetas a partir de esas transcripciones; y aplicar recompensas por invitaciones.'],
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
          'Supabase proporciona la base de datos y la autenticación. OpenAI es el proveedor de IA de texto de Semora: lee los programas de clase, genera las tarjetas de estudio, las preguntas de práctica y los cuestionarios, redacta los apuntes de tus clases y responde tus preguntas en el Tutor. Según la política de OpenAI, los datos enviados mediante la API no se utilizan para entrenar modelos salvo que el cliente lo autorice expresamente. Semora desactiva el almacenamiento de respuestas, aunque OpenAI puede conservar registros para detectar abusos durante un máximo de 30 días cuando no se aplique un control más estricto.',
          'Groq se usa únicamente si grabas una clase: el audio de esa grabación se envía a su API de transcripción para convertirlo en texto, junto con el título que le pusiste a la grabación y las últimas frases ya transcritas, que ayudan a mantener nombres y terminología coherentes a lo largo de una clase larga. La transcripción es el único fin para el que se usa tu audio y Groq es el único servicio al que se envía. Ningún otro contenido de tu cuenta —ni programas de clase, ni apuntes, ni mensajes del Tutor— se envía a Groq.',
          'Apple StoreKit procesa las suscripciones compradas dentro de la app y Stripe procesa los pagos con tarjeta hechos en la web. Expo envía las notificaciones que autorizas. Google Calendar solo recibe las fechas que eliges sincronizar; Semora no lee tus otros eventos.',
          'Google Analytics se usa solo en el sitio web semoraai.com para saber qué páginas y qué canales realmente traen gente a Semora. Google recibe la dirección de la página vista, los eventos descritos arriba y los datos técnicos que acompaña a cualquier petición web, incluida la dirección IP, que Google Analytics 4 usa para deducir una ubicación aproximada y no almacena. No funciona dentro de la app y nunca recibe los datos de tu cuenta.',
          'De forma predeterminada, las credenciales de Canvas, Blackboard, Moodle o Google Classroom permanecen en el dispositivo. Si activas la Sincronización automática, la credencial se guarda cifrada en Supabase Vault para actualizar cursos, tareas, entregas y calificaciones mientras la app está cerrada. La credencial se elimina cuando desactivas la función o desconectas la plataforma.',
        ],
      },
      {
        heading: 'Retención, eliminación y tus derechos',
        paragraphs: [
          'Conservamos tus datos mientras la cuenta esté activa. Puedes acceder a ellos desde la app, solicitar una exportación o eliminar permanentemente la cuenta y sus archivos desde Mi cuenta > Eliminar cuenta.',
          'El audio de las clases es la excepción y se elimina antes: la grabación se borra de nuestro almacenamiento en cuanto se crea su transcripción, normalmente pocos minutos después de que la detienes. Solo permanecen la transcripción y el material de estudio generado, que se eliminan cuando borras la grabación o tu cuenta.',
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
      { heading: '3. Suscripciones y pagos', paragraphs: ['Semora ofrece los planes Gratis y Pro. Pro se cobra de dos maneras, según dónde te suscribas: a través de la App Store de Apple si lo compras dentro de la app de iOS, o con tarjeta mediante Stripe, nuestro procesador de pagos, si lo compras en app.semoraai.com. Las suscripciones se renuevan automáticamente hasta que las canceles. Una suscripción con tarjeta se cancela desde Ajustes en Semora, en Gestionar plan de Semora, que abre el portal de facturación de Stripe; una suscripción de la App Store se cancela desde los ajustes de tu Apple ID, al menos 24 horas antes de que termine el periodo. Apple gestiona los reembolsos de las compras hechas en la App Store de acuerdo con sus políticas. Para los pagos con tarjeta en la web: escríbenos a semora365@gmail.com dentro de los 14 días siguientes a tu primer cargo y te lo devolvemos íntegro, sin preguntas. También devolvemos un cargo de renovación si nos escribes dentro de los 14 días siguientes y no has usado Pro desde que se renovó. Al cancelar dejas de recibir cargos y conservas Pro hasta que termine el periodo que ya pagaste. Si se ofrece una prueba gratuita, esta pasa a ser de pago si no la cancelas antes de que finalice.'] },
      { heading: '4. Límites del plan Gratis', paragraphs: ['El plan Gratis limita el número de acciones de IA, cursos y semestres. Pro amplía esos límites y añade personalización, sincronización, planificación y herramientas con IA. La app muestra los límites y precios vigentes antes de que realices una compra.'] },
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
      'Empieza gratis: conecta Canvas y todas tus clases se importan solas, sin Pro y sin límite, con una acción de IA para toda la vida de la cuenta, tareas, calificaciones y recordatorios. Pro añade automatización, cursos ilimitados y herramientas de estudio construidas sobre tus datos reales.',
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
        heading: 'Qué cubre de verdad el plan Gratis: Canvas sin límite y una acción de IA',
        paragraphs: [
          'El plan gratuito da una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre en total. Los tres números no se aplican igual, y la diferencia merece una frase. El límite de acciones de IA se comprueba en tres sitios: en la app, en la función que procesa el documento en el servidor antes de gastar nada en la extracción, y otra vez en un disparador de la base de datos. Los de cursos y semestre se comprueban en el servidor. No son cifras decorativas.',
          'Haz la cuenta de la primera semana. Una carga completa habitual son cuatro o cinco asignaturas, y la acción gratuita cubre una: escaneas el programa del curso cuyas fechas tengas menos claras y ves qué salió de la página. El contador sí es una bolsa para toda la vida: no se reinicia el día uno del mes ni al empezar el periodo siguiente. Un programa corregido en octubre no te cuesta uno de los de octubre, porque en el plan gratuito ya no queda ninguno: a partir de la primera, cualquier otra acción de IA es Pro. Los demás cursos se crean a mano, y todo lo que viene después se comporta igual con datos escritos a mano.',
          'Las acciones de IA y los cursos son límites distintos, y saberlo te ahorra dinero. Volver a escanear el programa de un curso que ya tienes se incorpora a ese curso — se emparejan por código, o por nombre exacto cuando el programa no trae código — así que gasta una acción de IA pero no una plaza de curso. Lo que ese emparejamiento no hace es sobrescribir el horario: las entregas entran, las clases se quedan como las dejaste y la escala solo cambia si seguía por defecto.',
          'Queda un límite que conviene poner en el mapa, porque es el que se descubre tarde: una cuenta gratuita tiene un semestre en total. No uno activo cada vez, con otro nuevo cada cuatrimestre. Uno. Por eso el único curso a mano no se renueva en enero: en el plan gratuito no hay un segundo semestre que empezar. Canvas es la excepción que lo hace llevadero: gratis, sin tope y sin contar nunca. Borrar el semestre terminado desde la pestaña de Cursos es la única forma de liberar la plaza, y ese borrado arrastra lo que colgaba de él.',
        ],
        bullets: [
          'Una acción de IA para toda la vida de la cuenta, sin reinicio mensual. Cinco páginas fotografiadas en un envío cuentan como una sola.',
          'Un curso a mano para la cuenta, no por semestre, porque el plan gratuito es de un semestre. Cubre justo una carga de cuatro y se queda a uno de una de cinco.',
          'Reescanear un curso que ya tienes se incorpora a él: gastas una acción de IA, conservas la plaza y tus correcciones del horario siguen intactas.',
          'Las entregas, las tareas y las subtareas no tienen tope. Añade las que quieras en el plan gratuito.',
          'El seguimiento de calificaciones con promedios ponderados y la nota media del semestre son gratis, en todos tus cursos.',
          'Unirte al espacio de un curso que organiza un compañero es gratis; ten en cuenta que el curso que importa ocupa una de tus cuatro plazas.',
          'Un semestre en total en el plan gratuito; semestres y cursos ilimitados en Pro, sin tope de escaneos ni de grabaciones de clase.',
        ],
      },
      {
        heading: 'Dónde cae exactamente la línea de Pro',
        paragraphs: [
          'La forma limpia de describir el reparto: el plan gratuito basta para saber qué tienes que entregar y en qué punto estás. Pro es para decidir qué hacer al respecto, más el tejido que te conecta con otras plataformas, otras personas y otros calendarios. Nada del plan gratuito caduca ni se degrada por lo bajo: los cursos, las fechas y las calificaciones siguen siendo tuyos, sin fecha de caducidad. Lo que no vuelve es la acción de IA, que se gasta una vez y no se repone.',
          'Hay dos fronteras que se cuentan mal lo bastante a menudo como para decirlas directamente. La primera: la importación desde Blackboard y Moodle es de Pro, y la de Canvas es gratis, no del plan gratuito. Está protegida en el servidor, así que el aviso no es una sugerencia del cliente que se pueda esquivar. La vía gratuita hacia Canvas existe y merece la pena: abre la página de tareas, selecciona el texto y pégalo en el escáner desde la web.',
          'La segunda: los espacios de curso se parten por la mitad. Organizar un curso compartido — crear el espacio y enviar la invitación — es de Pro, y esa comprobación también corre en el servidor. Unirte al espacio que te comparte un compañero es gratis, de forma permanente, sin límite de tiempo y sin tarjeta; lo único que hay que vigilar es que el curso que se importa ocupa una de tus cuatro plazas.',
          'Si dejas de pagar no se borra nada. Los límites del plan gratuito se comprueban al añadir algo nuevo, así que los cursos, semestres, entregas y calificaciones que ya tienes siguen siendo legibles y editables; lo que cambia es que las pantallas de Pro se bloquean otra vez y lo nuevo vuelve a regirse por ese único curso a mano, la regla de un solo semestre y esa única acción de IA, que si ya la gastaste no vuelve.',
          'El precio es 3,99 $ al mes o 19,99 $ al año, que sale a unos 1,67 $ al mes y alrededor de un 58 % menos que pagando mes a mes. La compra ocurre con tarjeta en la web, donde cobra Stripe, o dentro de la app de iOS a través de StoreKit, y la suscripción se aplica a toda tu cuenta, incluida la app web. Pagues donde pagues no hay nada que activar después: la app y la web leen la misma suscripción.',
        ],
        bullets: [
          'Gratis: una acción de IA, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, entregas y tareas ilimitadas, calificaciones ponderadas y nota media del semestre, recordatorios el mismo día, Hoy y Calendario completos.',
          'Capacidad de Pro: cursos y semestres ilimitados, y sin tope de escaneos ni de grabaciones — el único techo que queda es el de uso razonable, 20 escaneos en cualquier ventana de 24 horas, que ningún semestre real alcanza.',
          'Decisiones de Pro: Plan Inteligente, carga académica, revisión académica, escala de calificación propia y pronósticos, y análisis del progreso con gráficos y exportación.',
          'Estudio con Pro: tarjetas con repetición espaciada, temporizador de enfoque y el Tutor con IA anclado en tu propio curso.',
          'Conexiones de Pro: importación desde Canvas, Blackboard y Moodle, organizar espacios de curso, sincronización con el calendario del dispositivo con exportación .ics, y recordatorios con uno y tres días de antelación.',
        ],
      },
      {
        heading: 'Empieza por lo que se te esté rompiendo',
        paragraphs: [
          'Las listas de funciones son una mala forma de elegir por dónde empezar, porque no tienes un problema de funciones: tienes algo concreto yendo mal. Busca el síntoma. Casi todo esto se configura en menos de diez minutos, y las dos cosas que más importan en la primera semana — el primer escaneo y llevar las notas — no cuestan nada.',
          'Si el problema es que de verdad no sabes qué tienes que entregar, escanea el programa del curso que peor tengas controlado —esa es la acción gratuita—, añade los demás a mano y párate ahí por hoy. Hoy y el Calendario te sostienen durante semanas solo con el plan gratuito. Si el problema es que sabes lo que hay pero siempre empiezas tarde, eso es el Plan Inteligente: viene con 90 minutos al día en sesiones de 45 y se reajusta cuando una fecha se mueve.',
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
          'Las superficies se diferencian donde se diferencia el hardware, y solo ahí. Escanear en iOS usa la cámara, tu fototeca o la app Archivos; la web añade arrastrar y soltar sobre el marco de escaneo y pegar texto, que es la vía más rápida y precisa cuando estás en un portátil con el programa ya abierto. La app de iPhone es vertical; en iPad gira en las cuatro orientaciones y se reajusta en Split View. Las ventanas anchas del navegador cambian a una barra lateral fija. iOS suma widgets en la pantalla de inicio y la sincronización con el calendario del dispositivo, que no funciona en un navegador: ahí el equivalente es la exportación .ics. Pro se puede comprar en cualquiera de las dos superficies, con tarjeta en la web o en la App Store desde la app, y se lee en todas partes.',
        ],
        bullets: [
          'La misma cuenta y los mismos datos en iPhone, iPad y la web.',
          'No hay app para Android ni para Mac: en esos equipos Semora funciona en el navegador.',
          'Sincronización casi en tiempo real de cursos, entregas y semestres entre dispositivos.',
          'Consulta de puesta al día al volver del segundo plano, al recuperar el foco y al reconectar.',
          'Español completo en la app, elegido en la primera pantalla o en Configuración, y guardado en tu cuenta.',
          'Sin conexión: crea y edita cursos y tareas, márcalas como hechas, y todo se sincroniza solo.',
          'Solo en la web: arrastrar y soltar y pegar el texto del programa, de 20 a 60.000 caracteres.',
          'Solo en iOS: widgets en la pantalla de inicio y sincronización con el calendario del dispositivo.',
          'Exportaciones de Pro desde cualquier sesión: informe del semestre en CSV, vista para imprimir y un .ics del curso.',
        ],
      },
    ],
    faq: [
      {
        question: '¿Qué incluye exactamente el plan Gratis?',
        answer:
          'Una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento, la que gastes primero—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre, y un semestre en total, seguimiento completo de tareas y fechas, calificaciones con medias ponderadas, recordatorios el mismo día, y unirte al Espacio de curso al que te invite un compañero. Sin tarjeta de crédito, y no es una prueba que caduca.',
      },
      {
        question: '¿Qué funciones son de Pro?',
        answer:
          'Cursos y semestres ilimitados sin tope de escaneos ni de grabaciones de clase; importación desde Canvas, Blackboard y Moodle; alojar tu propio Espacio de curso; el Plan Inteligente y la carga académica; las Tarjetas de estudio; el temporizador de enfoque; el Tutor con IA; la escala de calificación editable y las calculadoras de hipótesis; sincronización con el calendario del dispositivo con exportación .ics; recordatorios con antelación personalizada; alertas de riesgo académico; las tendencias de progreso; y los logros compartidos.',
      },
      {
        question: '¿Tengo que escanear un programa para usar lo demás?',
        answer:
          'No. Puedes crear un curso a mano y añadir tú las entregas, las subtareas y las notas: el cálculo de calificaciones, el Calendario, la vista Hoy y los recordatorios se comportan igual con datos escritos a mano. El escáner es un atajo para la parte tediosa, no un requisito de entrada; lo que pasa es que esa parte tediosa son cuatro programas de golpe en la primera semana.',
      },
      {
        question: '¿Por qué función conviene empezar?',
        answer:
          'Por el escáner, porque cada herramienta de planificación y de estudio vale exactamente lo que tengas metido del semestre. Dos cursos a medias no le dan al Plan Inteligente ni a la carga académica casi nada sobre lo que razonar; cuatro cursos escaneados, con sus ponderaciones reales y algunas notas puestas, afilan los dos en una semana.',
      },
      {
        question: '¿Funciona todo en iPhone, iPad y la web?',
        answer:
          'Sí. Los tres comparten una cuenta y una base de datos, y se sincronizan casi en tiempo real, así que un cambio hecho en el móvil aparece en el navegador. Pro se compra con tarjeta en la web o dentro de la app de iOS, y se aplica a toda la cuenta pagues donde pagues: solo se paga una vez.',
      },
      {
        question: '¿Cuánto cuesta Pro?',
        answer:
          '3,99 USD al mes o 19,99 USD al año, que sale a unos 1,67 USD al mes en el plan anual. Se compra con tarjeta en la web, mediante Stripe, o en la app a través de la App Store; se gestiona desde Ajustes en Semora o desde tu Apple ID según cómo hayas pagado, y se aplica a toda tu cuenta.',
      },
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
      {
        heading: 'La fórmula: puntos de calidad divididos entre créditos',
        paragraphs: [
          'El GPA no es el promedio de tus notas. Es el promedio de tus notas ponderado por el tamaño de cada materia, y esa diferencia es la que sorprende a casi todo el mundo la primera vez que hace el cálculo a mano.',
          'El procedimiento tiene tres pasos. Primero, convierte cada letra en puntos según la escala de tu institución: en la escala estándar de 4,0, una A vale 4,0, una B 3,0, una C 2,0, una D 1,0 y una F 0. Segundo, multiplica los puntos de cada materia por sus créditos; el resultado son los puntos de calidad de esa materia. Tercero, suma todos los puntos de calidad y divide entre el total de créditos cursados.',
          'Un ejemplo concreto: A en un curso de 3 créditos son 12 puntos de calidad. B en uno de 4 créditos son 12. C en uno de 3 créditos son 6. La suma es 30 puntos de calidad sobre 10 créditos, es decir un GPA de 3,0. Fíjate en que la A y la B aportaron exactamente lo mismo, porque la materia de la B pesaba un crédito más.',
          'Ese es el motivo por el que un promedio simple de letras casi nunca coincide con el GPA real. Promediar 4,0, 3,0 y 2,0 también da 3,0 en este caso, pero solo por casualidad: en cuanto los créditos dejan de ser parecidos, las dos cifras se separan.',
        ],
        bullets: [
          'Puntos de calidad de una materia = puntos de la letra × créditos',
          'GPA = suma de puntos de calidad ÷ suma de créditos',
          'Un promedio simple de letras solo coincide si todas las materias tienen los mismos créditos',
        ],
      },
      {
        heading: 'Los créditos pesan más de lo que la mayoría espera',
        paragraphs: [
          'Un laboratorio de 1 crédito y un seminario de 5 no valen lo mismo, y esa asimetría decide semestres enteros. Si vas a arriesgar una nota, arriésgala en la materia pequeña: una C en un curso de 1 crédito cuesta el mismo daño al GPA que una fracción de una C en uno de 5.',
          'Al revés también funciona, y es el consejo más útil que sale de la fórmula. Si tienes tiempo limitado para estudiar y dos exámenes a la vez, el que más mueve tu GPA es el de la materia con más créditos, aunque el otro te resulte más urgente por cualquier otra razón.',
          'Conviene conocer los créditos reales de tu plan antes de hacer cualquier cuenta. Aparecen en el sistema de matrícula de tu institución y no siempre son los que uno supone: los cursos con laboratorio a menudo se registran como dos inscripciones separadas, una de teoría con 3 créditos y una de práctica con 1, cada una con su propia nota.',
        ],
        bullets: [
          'Las materias grandes mueven el GPA más que las pequeñas, en ambas direcciones',
          'Un curso con laboratorio puede aparecer como dos inscripciones con notas independientes',
          'Comprueba los créditos en el sistema de matrícula antes de calcular nada',
        ],
      },
      {
        heading: 'GPA del semestre, GPA acumulado, y cómo pasar de uno al otro',
        paragraphs: [
          'El GPA del semestre solo mira las materias de ese periodo. El acumulado mira todo lo que has cursado. Se calculan igual; lo único que cambia es qué entra en la suma.',
          'Para proyectar tu acumulado después de este semestre necesitas cuatro números: tus puntos de calidad acumulados hasta ahora, tus créditos acumulados, los puntos de calidad que esperas de este periodo y sus créditos. Suma cada par y divide. Si no conoces tus puntos de calidad acumulados, los obtienes multiplicando tu GPA acumulado actual por tus créditos acumulados.',
          'El efecto que más desconcierta es la inercia. Con 90 créditos acumulados, un semestre excelente de 15 créditos apenas mueve el acumulado unas décimas, porque pesa un sexto del total. Con 15 créditos acumulados, ese mismo semestre lo mueve muchísimo. Cuanto más avanzas en la carrera, más lento se vuelve el acumulado, en las dos direcciones.',
        ],
        bullets: [
          'Puntos de calidad acumulados = GPA acumulado × créditos acumulados',
          'Acumulado proyectado = (puntos previos + puntos nuevos) ÷ (créditos previos + créditos nuevos)',
          'Cuantos más créditos llevas, menos mueve el acumulado un solo semestre',
        ],
      },
      {
        heading: 'La escala con más y menos de tu institución es la que cuenta',
        paragraphs: [
          'La escala de 4,0 sin más ni menos es la excepción, no la norma. La mayoría de las universidades estadounidenses usan una escala con modificadores, y los valores no son universales: A− suele valer 3,7, B+ 3,3, B− 2,7, C+ 2,3, y así sucesivamente.',
          'Los dos puntos donde las instituciones difieren de verdad son el techo y el suelo. En muchas, A+ vale lo mismo que A —4,0— de modo que no existe forma de compensar una nota baja con una excelente. En algunas, A+ vale 4,3, lo que sí permite superar el 4,0. Y en otras la D− ni siquiera existe.',
          'Antes de fiarte de cualquier calculadora, incluida esta, busca la tabla oficial en el catálogo académico de tu institución y compárala. Una diferencia de 0,3 puntos en un modificador, repetida en cinco materias, mueve el resultado lo suficiente como para cambiar una decisión.',
        ],
        bullets: [
          'A− ≈ 3,7 y B+ ≈ 3,3 son habituales, pero no universales',
          'Muchas instituciones limitan A+ a 4,0; algunas lo cuentan como 4,3',
          'La tabla oficial vive en el catálogo académico, no en una calculadora',
        ],
      },
      {
        heading: 'Hacia atrás: la nota que necesitas este semestre',
        paragraphs: [
          'La pregunta útil casi nunca es «¿cuál es mi GPA?», sino «¿qué necesito sacar para llegar a donde quiero?». Esa se despeja con la misma fórmula, resuelta al revés.',
          'Los puntos de calidad que necesitas este semestre son: (GPA objetivo × créditos totales tras el semestre) − puntos de calidad acumulados. Divide ese resultado entre los créditos de este periodo y obtienes el GPA que necesitas sacar ahora.',
          'El número que salga puede ser imposible, y eso también es información. Si necesitas un 4,3 sobre una escala que llega a 4,0, el objetivo no es alcanzable este semestre y conviene saberlo en septiembre y no en diciembre. Lo que suele quedar entonces es replantear el horizonte: el mismo objetivo repartido en dos periodos casi siempre sí es alcanzable.',
        ],
        bullets: [
          'Puntos necesarios = (objetivo × créditos finales) − puntos acumulados',
          'GPA necesario este semestre = puntos necesarios ÷ créditos de este semestre',
          'Un resultado por encima del máximo de la escala significa que el objetivo necesita más de un semestre',
        ],
      },
      {
        heading: 'Aprobado/reprobado, bajas, repeticiones y créditos convalidados',
        paragraphs: [
          'Estas cuatro situaciones son las que más rompen los cálculos hechos a mano, porque cada institución las trata de forma distinta y ninguna se comporta como una nota normal.',
          'Un curso aprobado en modalidad de aprobado/reprobado suele sumar créditos hacia la titulación pero quedar fuera del GPA. Una baja registrada como W normalmente no entra en el GPA, aunque sí puede contar para las normas de avance académico. Una repetición puede sustituir la nota anterior, promediarse con ella, o dejar ambas en el expediente y contar solo la última para el GPA. Y los créditos convalidados de otra institución casi siempre aportan créditos sin aportar puntos de calidad.',
          'La regla práctica es simple: cualquier cosa que no sea una letra ordinaria en una materia ordinaria merece una comprobación en el catálogo antes de meterla en la cuenta. Son exactamente los casos en los que una calculadora genérica da un número equivocado con toda confianza.',
        ],
        bullets: [
          'Aprobado/reprobado: suele dar créditos sin entrar en el GPA',
          'W: normalmente fuera del GPA, pero puede contar para el avance académico',
          'Repeticiones: sustituir, promediar o conservar ambas, según la institución',
          'Convalidaciones: créditos sí, puntos de calidad casi nunca',
        ],
      },
      {
        heading: 'Los errores que producen un número equivocado',
        paragraphs: [
          'Promediar letras en lugar de ponderar por créditos es el más común, y da un resultado que parece razonable, lo cual lo hace peor. Solo coincide con el GPA real cuando todas tus materias tienen exactamente los mismos créditos.',
          'El segundo es usar la escala equivocada: aplicar la tabla estándar cuando tu institución usa modificadores, o al revés. El tercero es mezclar el porcentaje del curso con la letra: un 89 % no es automáticamente una B, porque los cortes los fija tu programa y algunos profesores ponen la A en 88.',
          'El cuarto es incluir materias que todavía no tienen nota. Contar como cero un curso sin calificar no da una estimación pesimista, da una cifra sin sentido: hasta que exista una letra, esa materia sencillamente no forma parte del cálculo.',
        ],
        bullets: [
          'No promedies letras: pondera por créditos',
          'Usa la tabla de tu institución, no la genérica',
          'Un porcentaje se convierte en letra con los cortes de tu programa',
          'Las materias sin calificar quedan fuera del cálculo, no entran como cero',
        ],
      },
      {
        heading: 'Dónde termina una calculadora y empieza el seguimiento',
        paragraphs: [
          'Una calculadora de GPA responde una pregunta al final del periodo, cuando las letras ya existen. El problema es que para entonces ya no puedes hacer nada con la respuesta.',
          'La pregunta que sí se puede accionar es la de antes: qué nota llevas ahora mismo en cada materia, con las ponderaciones que imprimió tu profesor, y qué necesitas en lo que queda. Eso exige seguir cada entrega calificada durante el semestre, no reconstruirlo en diciembre.',
          'Semora hace esa parte, y el seguimiento de calificaciones con medias ponderadas está en el plan Gratis: introduces la nota de cada trabajo y la media se recalcula sobre lo que de verdad se ha corregido. La estimación de GPA del semestre sale de ahí, usando los créditos que asignes a cada materia. Editar la escala de letras y usar las calculadoras de hipótesis forman parte de Pro.',
        ],
        bullets: [
          'Una calculadora responde al final; el seguimiento responde a tiempo',
          'El seguimiento con medias ponderadas está incluido en el plan Gratis',
          'La estimación de GPA usa los créditos que definas por materia',
        ],
      },
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
      {
        heading: 'De dónde viene la técnica',
        paragraphs: [
          'Francesco Cirillo la ideó a finales de los años ochenta, siendo estudiante universitario, con un temporizador de cocina con forma de tomate. De ahí el nombre: pomodoro es «tomate» en italiano.',
          'El planteamiento original era casi una apuesta consigo mismo. No podía concentrarse, así que se retó a estudiar sin interrupciones durante un tiempo tan corto que resultara imposible negarse: diez minutos. El método creció después hasta la forma que hoy se conoce, pero esa idea inicial es la que sigue haciendo el trabajo.',
          'Conviene decirlo porque cambia cómo se usa. La técnica no nació de un laboratorio de psicología cognitiva ni de una teoría sobre la duración de la atención. Nació de alguien que no conseguía empezar y encontró un truco para engañarse a sí mismo, y funciona por ese motivo, no por los veinticinco minutos en concreto.',
        ],
      },
      {
        heading: 'Arregla el empezar, no el concentrarse',
        paragraphs: [
          'Este es el malentendido más extendido, y explica por qué a mucha gente «no le funciona». Un temporizador no aumenta tu capacidad de concentración. Lo que hace es reducir el coste de empezar.',
          'Sentarse a estudiar tiene un precio psicológico que casi nunca se nombra: la tarea es grande, el final no se ve, y aceptar «me pongo con el trabajo» equivale a aceptar una cantidad de tiempo indefinida. La mente negocia con eso, y la negociación se gana sola posponiendo.',
          'Un bloque con nombre convierte esa negociación en algo pequeño y cerrado. No aceptas escribir el trabajo: aceptas veinticinco minutos. Eso sí se puede rechazar mal. Y una vez sentado y con el reloj corriendo, la mayoría de las sesiones continúan por inercia mucho después de lo que costó empezarlas.',
          'La consecuencia práctica: si tu problema es que te distraes a los cuarenta minutos, el temporizador ayuda poco. Si tu problema es que abres el PDF a las nueve y a las once sigues sin haber escrito una línea, ayuda mucho.',
        ],
      },
      {
        heading: 'Por qué 25 y 5 se convirtieron en la pareja estándar',
        paragraphs: [
          'Veinticinco minutos es suficiente para entrar en materia y lo bastante corto como para que la mayoría de la gente acepte empezarlo un martes por la noche. Cinco minutos de descanso alcanzan para levantarse y no para perder el hilo.',
          'No hay nada sagrado en esas cifras. Son un punto de partida razonable que Cirillo fijó porque funcionaba para él, y se quedaron porque funcionan razonablemente bien para mucha gente. Tratarlas como una prescripción es el error que hace que la técnica se abandone.',
          'La forma útil de usarlas es como valor por defecto: empieza en 25/5 y ajusta cuando el material te diga que otra duración encaja mejor. Casi todo el mundo acaba con dos o tres duraciones distintas según el tipo de trabajo, no con una sola.',
        ],
      },
      {
        heading: 'Cuándo 15, 45 o 50 encajan mejor',
        paragraphs: [
          'Quince minutos es la duración de rescate. Sirve para un hueco real entre clases una vez que has cruzado el campus y te has sentado, y sirve todavía más para las tareas que llevas cuatro días evitando: un bloque tan corto que negarse resulta absurdo. Muchas sesiones de quince minutos terminan durando cuarenta.',
          'Cuarenta y cinco es la duración de trabajo de fondo. Para leer un capítulo denso, escribir, o resolver problemas encadenados, veinticinco minutos cortan justo cuando estabas entrando; cuarenta y cinco deja terminar una unidad de pensamiento completa.',
          'Cincuenta existe por un motivo puramente logístico: es lo que dura una clase en la mayoría de horarios universitarios, así que encaja en los huecos que tu propio calendario ya crea. Si tu día está partido en bloques de cincuenta minutos, estudiar en bloques de cincuenta minutos elimina la aritmética.',
          'La regla que resume las tres: elige la duración según lo que cueste retomar el hilo del material. Cuanto más caro sea reengancharse, más largo debe ser el bloque.',
        ],
        bullets: [
          '15 min: huecos entre clases y tareas que llevas evitando',
          '25 min: el valor por defecto, bueno para repaso y trabajo fragmentado',
          '45 min: lectura densa, escritura y problemas encadenados',
          '50 min: encaja con un horario universitario partido en clases de 50',
        ],
      },
      {
        heading: 'Cómo gastar el descanso para que sirva de algo',
        paragraphs: [
          'El descanso es la parte que casi todo el mundo hace mal, y hacerlo mal anula buena parte del método. La regla es sencilla: el descanso tiene que ser de un tipo distinto al trabajo que acabas de hacer.',
          'Cinco minutos en redes sociales no descansan de leer una pantalla, porque siguen siendo leer una pantalla, con la desventaja añadida de que arrastran. La cuenta de cinco minutos casi nunca sobrevive a un feed infinito, y volver cuesta tanto como volver de una interrupción real.',
          'Lo que sí funciona: levantarte, caminar, beber agua, mirar por la ventana a algo lejano, estirarte. Son aburridos a propósito. Un descanso aburrido termina solo cuando suena el temporizador; uno interesante no termina.',
          'Cada cuatro bloques conviene un descanso largo, de quince a treinta minutos. Ese sí puede ser una comida o una conversación, porque su función es distinta: cerrar un ciclo, no sostener la sesión.',
        ],
      },
      {
        heading: 'Qué hacer cuando te interrumpen',
        paragraphs: [
          'Cirillo distinguía entre interrupciones internas —te acuerdas de que tienes que responder un correo— y externas —alguien te habla—. El tratamiento es distinto y merece la pena conocerlo.',
          'Para las internas, la técnica es anotar y seguir. Apunta la cosa en una hoja al lado, en cinco palabras, y vuelve al bloque. Casi siempre lo que la mente quería no era hacer la tarea, sino la garantía de que no se olvidará; escribirla da esa garantía a un coste de tres segundos.',
          'Para las externas, la regla original es más estricta de lo que la gente espera: si el bloque se rompe de verdad, se descarta y se empieza otro. No se pausa a la mitad y se retoma veinte minutos después, porque eso convierte el bloque en una unidad que ya no mide nada.',
          'En la práctica, la mayoría de la gente afloja esa norma, y está bien. Lo que no conviene aflojar es la costumbre de no renegociar la duración a mitad de camino: un bloque que puedes alargar en el minuto 22 deja de ser un compromiso.',
        ],
      },
      {
        heading: 'Los límites que conviene conocer antes de apoyarte en ella',
        paragraphs: [
          'No sirve para todo tipo de trabajo. Las tareas que exigen un arranque largo —montar un entorno, entrar en un problema matemático complicado, retomar un texto extenso— pagan un peaje fijo cada vez que empiezas, y trocearlas en bloques de veinticinco minutos multiplica ese peaje.',
          'Tampoco sustituye a decidir qué estudiar. Un temporizador te dice cuándo parar, no qué es lo importante; se puede pasar una tarde entera haciendo pomodoros impecables sobre el material equivocado, y la sensación de productividad será alta.',
          'Y no arregla un problema de volumen. Si tienes cuarenta horas de trabajo y quince disponibles, ninguna estructura de sesiones cierra esa brecha; lo que hace falta es recortar alcance o pedir una prórroga, y cuanto antes se vea, mejor.',
          'La evidencia sobre las duraciones concretas es además más floja de lo que sugiere su popularidad. Que las pausas ayuden al rendimiento sostenido está razonablemente respaldado; que veinticinco minutos sea la cifra correcta, no. Trátalo como una herramienta práctica, no como un hallazgo científico.',
        ],
      },
      {
        heading: 'Meter estudio cronometrado en una semana universitaria real',
        paragraphs: [
          'El horario de un estudiante no es una fila de tardes libres. Es un hueco de cincuenta minutos antes de la siguiente clase, veinte minutos en el autobús, una hora en la biblioteca que se interrumpe dos veces. La mayoría de los consejos de estudio dan por supuesto un bloque continuo que no existe.',
          'El ajuste que más rinde es dejar de buscar el momento ideal y empezar a usar los huecos que ya tienes. Un bloque de quince minutos entre dos clases, hecho tres veces por semana, son cuarenta y cinco minutos que antes no existían, y suelen ser los más fáciles de sostener porque no compiten con nada.',
          'El segundo ajuste es emparejar la duración con el hueco, no al revés. Antes de una clase, quince. En una tarde despejada, cuarenta y cinco o cincuenta. Intentar meter cuarenta y cinco minutos en un hueco de treinta produce una sesión interrumpida que cuenta como fracaso sin serlo.',
          'El tercero es decidir la tarea antes de arrancar el reloj. «Voy a estudiar» no cabe en un bloque; «voy a hacer los problemas 4 a 9» sí, y además se sabe cuándo está terminado.',
        ],
      },
      {
        heading: 'Dónde encaja el temporizador de Semora',
        paragraphs: [
          'El temporizador de Semora ofrece bloques de 15, 25, 45 o 50 minutos y descansos de 5, 10 o 15, y abre por defecto en la pareja clásica de 25 y 5. Mantiene la cuenta en segundo plano y avisa al terminar cada fase.',
          'Los selectores desaparecen mientras un bloque está corriendo, a propósito, para que la duración que aceptaste al empezar siga significando algo en el minuto 22. Si de verdad necesitas cambiarla, primero se pausa; cambiar la duración en pausa reinicia esa fase a la nueva duración completa, no al tiempo restante.',
          'La diferencia con un temporizador cualquiera es de contexto. Semora ya tiene tu programa, tus entregas y tu plan de estudio, así que un bloque puede arrancarse desde una sesión concreta del Plan Inteligente y quedar asociado a la tarea que estás haciendo. Como el Plan Inteligente programa en incrementos de quince minutos, una sesión planificada de 30 abre un bloque de 30 en lugar de redondearse.',
          'El temporizador forma parte de Pro, a 3,99 USD al mes o 19,99 USD al año. La herramienta de esta página, en cambio, es gratuita y no necesita cuenta: úsala tal cual si lo único que buscas es una cuenta atrás decente.',
        ],
        bullets: [
          'Enfoque de 15, 25, 45 o 50 minutos; descansos de 5, 10 o 15',
          'Cuenta en segundo plano, con aviso al final de cada fase',
          'Se puede lanzar desde una sesión del Plan Inteligente y conservar su duración',
          'El temporizador de la app es Pro; el de esta página es gratuito y sin cuenta',
        ],
      },
    ],
    faq: [
      { question: '¿Tengo que usar 25 minutos?', answer: 'No. Puedes elegir 15, 25, 45 o 50 minutos y descansos de 5, 10 o 15.' },
      { question: '¿El temporizador sigue si cambio de pestaña?', answer: 'Sí. El temporizador se basa en una hora de finalización, así que el tiempo restante sigue siendo exacto incluso cuando el navegador reduce la actividad de una pestaña en segundo plano.' },
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
      {
        heading: 'Tres trabajos distintos que la gente confunde',
        paragraphs: [
          'Las aplicaciones para estudiantes se anuncian como si compitieran entre sí, y en realidad la mayoría hace uno de tres trabajos bastante separados.',
          'El primero es sostener un semestre: reunir entregas, fechas, ponderaciones y horarios, y mantener eso al día cuando algo cambia. El segundo es fabricar material de estudio: convertir una lectura, una clase grabada o un capítulo en resúmenes, tarjetas y cuestionarios. El tercero es gestión general de tareas o proyectos, que sirve para cualquier ámbito y no sabe nada de asignaturas.',
          'Casi ninguna herramienta es buena de verdad en los tres, y las comparaciones se vuelven mucho más fáciles en cuanto decides cuál de los tres te está costando tiempo. Semora hace el primero, con una capa de estudio construida encima de los datos del primero.',
        ],
        bullets: [
          'Sostener el semestre: fechas, ponderaciones, calificaciones, horarios',
          'Fabricar material de estudio: resúmenes, tarjetas, cuestionarios',
          'Gestión general de tareas: flexible, pero sin contexto académico',
        ],
      },
      {
        heading: 'Cómo entra la información es la decisión que más pesa',
        paragraphs: [
          'Antes de mirar listas de funciones, mira por dónde entran los datos, porque eso decide si vas a seguir usando la herramienta en la semana seis.',
          'Hay tres vías. La entrada manual funciona en cualquier sitio y no tiene coste de configuración, pero es trabajo que se repite cada periodo y es exactamente lo que hace que las agendas se abandonen. La importación desde el campus virtual elimina ese trabajo, pero depende de que tu institución la permita y solo refleja lo que el profesor publica allí. Y la extracción desde el programa lee el documento que ya contiene el semestre, incluidas las ponderaciones y las fechas de examen que rara vez llegan a la plataforma.',
          'Ninguna es superior en abstracto. Lo que importa es cuál encaja con cómo publican tus profesores, y eso lo sabes tú y no una tabla comparativa.',
        ],
      },
      {
        heading: 'Qué mantiene actualizado cada producto',
        paragraphs: [
          'Una herramienta puede recoger bien los datos y aun así envejecer mal, y esa diferencia solo se nota a mitad de curso.',
          'La prueba concreta es mover una fecha. Cámbiala, o resincroniza después de que el profesor la cambie, y comprueba cuatro cosas: que la entrega se actualizó en su sitio en lugar de duplicarse, que el recordatorio ahora salta con la fecha nueva, que el evento de calendario que creó la app se editó en vez de copiarse, y que lo que ya habías marcado como hecho sigue marcado.',
          'Esa secuencia, que lleva cinco minutos, revela la mayoría de las debilidades reales de estas aplicaciones, y ninguna página de funciones la contesta.',
        ],
      },
      {
        heading: 'Cuánto trabajo manual queda al final',
        paragraphs: [
          'Es la medida que de verdad importa y la que menos aparece en las comparativas. Una lista larga de funciones sirve de poco si sigues copiando cada fecha a mano.',
          'Cuenta los pasos de un semestre completo con cada candidata: cuántas veces tienes que teclear una fecha, cuántas veces tienes que introducir una ponderación, cuántas veces tienes que actualizar algo a mano cuando un profesor cambia el calendario.',
          'En Semora ese recuento es: un escaneo por materia, una pantalla de revisión por materia, y después introducir las notas según van llegando. Las ponderaciones salen del programa, los recordatorios se programan solos al aprobar las fechas y la media se recalcula al introducir cada nota.',
        ],
      },
      {
        heading: 'Cómo leer un plan gratuito frente a una prueba',
        paragraphs: [
          'Responden a preguntas distintas y conviene no confundirlas. Una prueba te enseña el producto entero durante poco tiempo y después cobra; los precios de introducción suelen limitarse a quienes se suscriben por primera vez, así que mira el precio de renovación. Un plan gratuito con límites te enseña menos, durante el tiempo que quieras.',
          'Lo decisivo es dónde cae el límite. Un tope sobre la parte con IA —escanear un programa, grabar una clase— se nota una vez y después ya sabes a qué atenerte. Un tope sobre algo que haces a diario —seguir entregas, ver tu nota— convierte el plan gratuito en una demostración.',
          'En Semora los topes del plan Gratis son una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre, y un semestre en total. El seguimiento de entregas y el motor de calificaciones ponderadas están completos y sin límite dentro de esos topes.',
        ],
      },
      {
        heading: 'Qué pasa con tu semestre si te vas',
        paragraphs: [
          'Pregúntalo antes de suscribirte. Lo que quieres saber es si una suscripción vencida deja tus datos en solo lectura, los oculta, o simplemente apaga la automatización de pago mientras las fechas y las notas siguen editables.',
          'Después busca las salidas: un archivo de calendario, un CSV y una vista para imprimir son las tres que importan de verdad, además de una ruta real para borrar la cuenta.',
          'En Semora, al caducar Pro se conserva todo lo del plan Gratis, la sincronización con el calendario se pausa en lugar de borrar los eventos que creó, y los Espacios de curso que alojas siguen existiendo. Las exportaciones —CSV del semestre, vista de impresión y .ics del curso— son funciones de Pro, así que si vas a marcharte, exporta antes.',
        ],
      },
      {
        heading: 'Cuándo la respuesta correcta son dos herramientas',
        paragraphs: [
          'Usar dos suele ser lo correcto y rara vez sale caro, y decirlo en una página de comparaciones es más útil que fingir lo contrario.',
          'Sostener un semestre y generar material de estudio a partir de una lectura concreta son trabajos distintos, y las herramientas construidas para uno tienden a flojear en el otro. La combinación habitual es una para fechas, ponderaciones, calificaciones y horarios, y otra que convierta una clase o un capítulo en tarjetas y cuestionarios.',
          'Semora incluye una capa de estudio —tarjetas y un tutor anclados a tu programa y tus apuntes— pero está construida sobre los datos del semestre, no como generador general de material a partir de cualquier documento. Si tu problema principal es lo segundo, empieza por una herramienta especializada en eso.',
          'La regla final: decide qué problema te cuesta más horas y resuelve ese primero. Añadir una segunda herramienta después es fácil; cambiar de sistema a mitad de semestre, no.',
        ],
      },
    ],
    faq: [
      {
        question: '¿Necesito un escáner de programas si mi universidad ya usa Canvas?',
        answer:
          'Depende de lo que publiquen tus profesores allí. Una conexión con el LMS refleja las tareas que el profesor sube realmente a la plataforma; el programa es donde suelen vivir las ponderaciones, las fechas de examen, el calendario de lecturas, las horas de atención y la escala de calificación, y buena parte de eso nunca llega a ser una entrada del LMS. Si todos tus cursos se gestionan por completo en la plataforma, la sincronización puede bastar. Si alguno no, el escáner cubre ese hueco.',
      },
      {
        question: '¿Cuál es la mejor prueba antes de confiarle un semestre a una app?',
        answer:
          'Mueve una fecha de entrega. Cámbiala en la app, o resincroniza después de que el profesor la cambie, y comprueba cuatro cosas: que el elemento se actualizó en su sitio en lugar de duplicarse, que el recordatorio ahora salta con la fecha nueva, que el evento de calendario que creó la app se editó en vez de copiarse, y que lo que ya habías marcado como hecho sigue marcado. Casi todas las debilidades de estas herramientas salen a la luz en esa secuencia.',
      },
      {
        question: '¿Cómo distingo un seguimiento de calificaciones real de una calculadora de GPA?',
        answer:
          'Fíjate en si se alimenta de las tareas que ya sigues o de una pantalla aparte que mantienes a mano. Después mira las cuentas: categorías ponderadas en lugar de un promedio plano, la posibilidad de descartar la nota más baja, una media que divide entre el peso ya cursado en vez de contar como cero lo que aún no se ha calificado, y cortes de letra editables para que el resultado coincida con la escala de tu institución.',
      },
      {
        question: '¿Es mejor un plan gratis con límites o una prueba gratuita?',
        answer:
          'Responden a preguntas distintas. Una prueba te enseña el producto entero durante poco tiempo y después te cobra, y los precios de introducción suelen limitarse a quienes se suscriben por primera vez, así que mira el precio de renovación y si cumples los requisitos. Un plan gratis con límites te enseña menos, durante el tiempo que quieras. Lo que importa es si el límite recae sobre la parte con IA, como escanear un programa, o sobre algo que haces a diario, como seguir tus entregas: lo segundo convierte el plan en una demostración, lo primero no.',
      },
      {
        question: '¿Conviene usar una app o dos?',
        answer:
          'Dos suele ser lo correcto y rara vez sale caro. Sostener un semestre y generar material de estudio a partir de una lectura concreta son trabajos distintos, y las herramientas construidas para uno tienden a flojear en el otro. Una combinación habitual es una herramienta para fechas, ponderaciones, calificaciones y horarios, y una segunda que convierta una clase o un capítulo en tarjetas y cuestionarios. Decide qué problema te cuesta más y resuelve ese primero.',
      },
      {
        question: '¿Qué pasa con mi semestre si dejo de pagar o cambio de app?',
        answer:
          'Pregúntalo antes de suscribirte, no después. Averigua si una suscripción vencida deja tus datos en solo lectura, los oculta, o simplemente apaga la automatización de pago mientras las fechas y las notas siguen siendo editables. Después busca las exportaciones: un archivo de calendario, un CSV y una vista para imprimir son las tres que importan, además de una forma real de borrar la cuenta. En Semora, la sincronización con el calendario del dispositivo se pausa si Pro caduca, en lugar de borrar los eventos que creó.',
      },
    ],
  }),
];

const KEYWORD_PAGES: SpanishPageConfig[] = [
  page('/es/generador-de-tarjetas-con-ia', '/ai-flashcard-generator', 'standard', {
    metaTitle: 'Generador de tarjetas de estudio con IA',
    metaDescription: 'Genera un mazo a partir del programa y los apuntes del propio curso, enfocado en un examen concreto si quieres, y repásalo con repetición espaciada.',
    h1: 'Un generador de tarjetas que ya tiene tu material',
    lede: 'Casi todos los generadores te piden que pegues algo. Este parte del programa y los apuntes que ya están en el curso, y puede enfocar un mazo en un examen concreto que estés siguiendo.',
    intro: [
      'La parte tediosa de las tarjetas nunca fue repasarlas. Fue fabricarlas: releer un capítulo decidiendo qué merece una tarjeta y después teclear las dos caras, justo en el momento en que menos te apetece otra tarea.',
      'Los generadores con IA resuelven el tecleo y suelen introducir otra faena en su lugar: buscar el material, pegarlo, y repetirlo con el capítulo siguiente. Si la herramienta no recuerda tu curso, cada mazo empieza de cero.',
      'Esta página describe un generador con la posición de partida contraria —uno que ya tiene el programa del curso y los apuntes que subiste—, qué hace con ese material, cuánto lee exactamente, y cómo decide el repaso qué ponerte delante.',
    ],
    sections: [
      {
        heading: 'De qué se construye el mazo',
        paragraphs: [
          'Cuando generas, la petición lleva el material del propio curso en lugar de lo que hayas pegado. Entran tres fuentes.',
          'El análisis más reciente del programa de esa materia: hasta 60 elementos extraídos, cada uno con su título y su tipo, recortados a 8.000 caracteres. Eso es lo que le da al mazo la forma del curso: sus temas, sus unidades, lo que el profesor dijo que iba a cubrir.',
          'Hasta los 10 archivos de apuntes más recientes de ese curso, que comparten un presupuesto de 24.000 caracteres de texto extraído, cada uno etiquetado con su nombre de archivo. Los apuntes se leen del más nuevo al más antiguo, sobre la suposición razonable de que lo reciente es lo que estás estudiando.',
          'Y una lista construida con las demás tareas del curso —hasta 60, ordenadas por fecha— para que el generador sepa qué contiene el periodo alrededor de lo que estudias.',
        ],
        bullets: [
          'Programa: hasta 60 elementos, 8.000 caracteres',
          'Apuntes: los 10 archivos más nuevos, 24.000 caracteres compartidos',
          'Tareas registradas: hasta 60, ordenadas por fecha',
        ],
      },
      {
        heading: 'Enfocar el mazo en un examen y no en todo el curso',
        paragraphs: [
          'El panel de generación pregunta dos cosas y luego confirma. La primera es en qué enfocarse: el curso entero, o un elemento concreto que ya estés siguiendo como fecha de entrega.',
          'Esa segunda opción es la que se gana su sitio. Un mazo generado para todo el curso está diluido por definición: un repaso de parcial que incluye material del examen final es un peor mazo para el parcial, por buenas que sean las tarjetas sueltas. Apuntarlo a un examen registrado acota el material de origen a lo que ese examen abarca.',
          'Funciona porque los exámenes ya están en la app como elementos reales con fecha y tipo, extraídos del programa. Un generador que no sabe nada de tu periodo no puede ofrecer esto, porque no tiene forma de saber qué cubre tu parcial ni cuándo es.',
        ],
      },
      {
        heading: 'Añadir el material de repaso que dio el profesor',
        paragraphs: [
          'La segunda pregunta del panel es material de estudio opcional: adjunta un PDF o una foto y pasa a formar parte de aquello con lo que se genera el mazo, junto al programa y los apuntes.',
          'Es la entrada con más señal de todas, y conviene usarla cuando existe. Una hoja de repaso es el profesor diciéndote qué entra en el examen, con sus palabras y su énfasis.',
          'El archivo va a un almacenamiento privado, archivado bajo tu propio identificador de usuario. No se procesa en el teléfono: la primera vez que una generación o el Tutor lo necesitan, el servidor lo lee, extrae el texto legible conservando la estructura y guarda el resultado en caché.',
        ],
      },
      {
        heading: 'Qué devuelve y qué se descarta',
        paragraphs: [
          'La forma del resultado está fijada y no se deja al modelo. El anverso es una pregunta corta o un término. El reverso es una respuesta o definición concisa, de una a tres frases.',
          'El objetivo son entre 10 y 20 tarjetas, con la instrucción explícita de que pocas tarjetas buenas valen más que rellenar: si el material no da para veinte, no debe inventarlas.',
          'Después se valida todo antes de guardar. Ambas caras se recortan y cada una se limita a 300 caracteres. Cualquier entrada a la que le falte el anverso o el reverso se descarta en lugar de tumbar el lote entero, así que si catorce de dieciséis salieron bien, te quedas con las catorce. No se insertan más de 30 por ejecución.',
          'El tope de 300 caracteres es un límite defensivo sobre lo que devuelve el modelo. Las tarjetas que escribes tú no se recortan.',
        ],
      },
      {
        heading: 'El calendario de repaso, en números reales',
        paragraphs: [
          'Cada tarjeta lleva cuatro valores: un factor de facilidad, un intervalo en días, una fecha de repaso y un contador de aciertos seguidos. Una tarjeta nueva empieza con facilidad 2,5, intervalo 0 y repaso inmediato, así que todo lo que generes entra en tu siguiente sesión sin esperas.',
          'Calificar una tarjeta ejecuta una variante compacta de SM-2. «Otra vez» baja la facilidad 0,20, reinicia el contador de aciertos y devuelve la tarjeta en unos diez minutos en lugar de mañana. «Difícil» baja la facilidad 0,15; una tarjeta nueva pasa a un día y una establecida multiplica su intervalo por 1,2. «Bien» sigue la escalera estándar: un día, luego seis, y a partir de ahí multiplicado por la facilidad de la propia tarjeta. «Fácil» sube la facilidad 0,15 y multiplica por esa facilidad más un extra de 1,3, así que una tarjeta nueva calificada como fácil salta directamente a seis días.',
          'La facilidad tiene un suelo de 1,3 —el de SM-2— aplicado tanto en el planificador como por una restricción en la base de datos, de modo que una mala semana de «otra vez» y «difícil» no puede meter una tarjeta en un bucle permanente.',
          'En la práctica, una tarjeta que aciertas siempre va a un día, luego seis, luego quince, luego unos treinta y ocho, y después alrededor de tres meses. Una que fallas siempre se queda delante de ti.',
        ],
        bullets: [
          'Tarjeta nueva: facilidad 2,5, repaso inmediato',
          '«Otra vez» ≈ 10 minutos; escalera de «Bien»: 1 día → 6 días → × facilidad',
          '«Fácil» multiplica por la facilidad y por un 1,3 adicional',
          'La facilidad nunca baja de 1,3',
        ],
      },
      {
        heading: 'Una sesión, y las tarjetas que escribes tú',
        paragraphs: [
          'Al empezar una sesión se congela la cola de repaso en ese momento. Calificar una tarjeta empuja su fecha hacia el futuro, y sin esa foto fija la lista se reordenaría bajo tus pies a mitad de sesión. Un contador muestra tu posición, como 4 / 12, con una salida al lado.',
          'Generar es totalmente opcional. «Nuevo mazo» crea un mazo vacío con un título de hasta 80 caracteres, asociado al curso desde el que entraste o sin categoría si abriste las Tarjetas por su cuenta. «Añadir tarjeta» te da dos campos de varias líneas, anverso y reverso, ambos obligatorios: una tarjeta con una cara en blanco no se guarda.',
          'Las tarjetas escritas a mano y las generadas viven en el mismo mazo y las programa el mismo algoritmo. Aquí no hay ciudadanos de segunda.',
        ],
      },
      {
        heading: 'Qué cuesta y cuándo usar otra cosa',
        paragraphs: [
          'Las Tarjetas de estudio forman parte de Pro, a 3,99 USD al mes o 19,99 USD al año —unos 1,67 USD al mes en el anual— compradas con tarjeta en la web o en la app de iOS y aplicadas a toda la cuenta, incluida la web.',
          'La limitación honesta es el material de origen. Este generador es fuerte cuando un curso tiene un programa escaneado y apuntes subidos, y débil cuando no tiene ninguno de los dos, porque no hay de qué partir. Si lo que quieres es convertir un PDF cualquiera o una clase de YouTube en un mazo sin curso asociado, un generador de propósito general encaja mejor y deberías usar uno.',
          'Tampoco es una biblioteca de mazos compartidos. No se pueden explorar los mazos de otros estudiantes: aquí todo sale del material de tu propio curso o lo escribes tú.',
        ],
      },
    ],
    faq: [
      { question: '¿Necesito subir algo para generar un mazo?', answer: 'No, si el curso tiene un programa escaneado: con eso ya se puede generar. Los apuntes subidos y una hoja de repaso adjunta afinan el mazo, y un curso que no tenga ninguna de las tres cosas no tiene de qué partir.' },
      { question: '¿Cuántas tarjetas hace?', answer: 'Apunta a entre 10 y 20, con la instrucción de que pocas tarjetas buenas valen más que rellenar, y no inserta más de 30 por ejecución. Las tarjetas a las que les falte una cara se descartan en lugar de tumbar el lote.' },
      { question: '¿Puedo generar un mazo solo para mi parcial?', answer: 'Sí. El panel de generación permite enfocarse en un elemento concreto que ya estés siguiendo como fecha, en lugar del curso entero, que es lo que evita que un repaso de parcial se diluya con material del final.' },
      { question: '¿Qué algoritmo de repetición espaciada usa?', answer: 'Una variante compacta de SM-2. Las tarjetas nuevas empiezan con facilidad 2,5 y repaso inmediato; «otra vez» devuelve la tarjeta en unos diez minutos, «bien» sigue una escalera de un día, seis días y después multiplicar por la facilidad, y la facilidad tiene un suelo de 1,3.' },
      { question: '¿Mis tarjetas se tratan distinto que las generadas?', answer: 'Comparten mazo y el mismo calendario. La única diferencia es el tope de 300 caracteres por cara, que es un límite defensivo sobre la salida del modelo: las que escribes tú no se recortan.' },
      { question: '¿El generador de tarjetas es gratis?', answer: 'No, forma parte de Pro, a 3,99 USD al mes o 19,99 USD al año. El plan Gratis cubre tu primer escaneo de programa, el seguimiento de entregas, las calificaciones ponderadas y los recordatorios el mismo día.' },
    ],
  }),
  page('/es/tutor-con-ia-para-universitarios', '/ai-tutor-for-college-students', 'standard', {
    metaTitle: 'Tutor con IA para estudiantes universitarios',
    metaDescription: 'Un tutor con IA que responde desde tu propio programa, tus fechas registradas y tus apuntes subidos, cita lo que usó y nunca inventa una fecha de entrega.',
    h1: 'Un tutor con IA que sabe en qué materia estás',
    lede: 'Los chatbots generales explican conceptos bien y no saben nada de tu situación. A este se le entrega tu programa, tus fechas registradas y tus apuntes antes de que vea la pregunta.',
    intro: [
      'Pregúntale a un chatbot general cuándo es tu examen final y o bien se negará o, peor, adivinará de forma verosímil. No sabe que tu profesor dijo que el parcial abarca los capítulos uno a seis y no el siete. No sabe que tu ensayo pasó del día 14 al 21. El modelo es capaz; sencillamente no tiene acceso a tu periodo.',
      'Ese hueco no se arregla con un modelo mejor. Se arregla dándole el material correcto antes de que responda, y limitando aquello desde lo que puede responder.',
      'Esta página describe exactamente qué se reúne antes de enviar una pregunta, cómo se tratan las respuestas sobre fechas frente a todo lo demás, qué decide no saber el tutor, y cuáles son los límites reales en números.',
    ],
    sections: [
      {
        heading: 'Qué se reúne antes de ver tu pregunta',
        paragraphs: [
          'El servidor construye un paquete con tu material real y le indica al modelo que responda a partir de él. Entran cuatro cosas.',
          'Tus clases, incluidos laboratorios y sesiones de discusión, porque se guardan como tipos de sesión propios. Tu escala de calificación, como texto plano —A a partir del 93 %, B a partir del 83, o lo que use tu institución— si la has personalizado.',
          'Los elementos estructurados de tu escaneo más reciente del programa: con un tope de 8.000 caracteres y hasta 60 elementos. Y tus fechas de entrega actuales: también 8.000 caracteres y hasta 60 tareas.',
          'Los apuntes se leen del más nuevo al más antiguo: los 10 archivos más recientes de ese curso, compartiendo un presupuesto de 24.000 caracteres de texto extraído. Un bloque de programa o de fechas que haya tenido que recortarse se marca explícitamente como truncado, para que el modelo sepa que trabaja con una fuente abreviada y no trate una lista parcial como completa.',
        ],
        bullets: [
          'Clases, incluidos laboratorios y sesiones de discusión',
          'Tu escala de calificación, con los cortes personalizados',
          'Programa: 8.000 caracteres, hasta 60 elementos',
          'Fechas: 8.000 caracteres, hasta 60 tareas',
          'Apuntes: los 10 archivos más nuevos, 24.000 caracteres compartidos',
        ],
      },
      {
        heading: 'Las respuestas sobre fechas salen de tu lista, no del modelo',
        paragraphs: [
          'Esta es la restricción que más importa, porque es donde una respuesta equivocada y segura de sí misma hace daño de verdad.',
          'Para las preguntas sobre qué vence y cuándo, el tutor responde estrictamente desde tu lista real de tareas registradas. No razona hasta llegar a una fecha, ni rellena un hueco con algo verosímil. Si la información no está en lo que le has dado, lo dice con claridad y ofrece ayuda general en lugar de inventarse un dato concreto.',
          'Cita lo que usó en lenguaje corriente y no con notas al pie —«tu programa indica…», «según tus apuntes de la semana 3…»— que es suficiente para saber si una respuesta salió de tu material o del conocimiento general. Esa distinción es justamente el objetivo.',
        ],
      },
      {
        heading: 'Qué decide no saber',
        paragraphs: [
          'El bloque de fechas lleva títulos, tipos, fechas, horas, ponderaciones y si has marcado algo como hecho. No lleva tus notas.',
          'Así que el tutor sabe que el examen final vale el 30 % de la nota y que aún no lo has hecho. No sabe qué sacaste en el parcial, y no puede decirte qué necesitas en el final: para eso están las calculadoras de hipótesis del seguimiento de calificaciones.',
          'Es una decisión de diseño y no un descuido, y conviene saberlo para no hacerle una pregunta que responderá mal. Un tutor con tus notas podría ser más útil y estaría además guardando más de tu expediente del que necesita una función de chat.',
        ],
      },
      {
        heading: 'Subir apuntes de clase',
        paragraphs: [
          'Los apuntes se asocian a un curso, así que abre el tutor desde un curso y no por su cuenta: si no lo has hecho, la app te lo dice en lugar de aceptar un archivo huérfano. Funcionan tanto PDF como fotos.',
          'La extracción ocurre en el servidor, no en tu teléfono. El archivo va a un almacenamiento privado archivado bajo tu propio identificador de usuario, y la primera vez que una petición lo necesita el servidor lo lee, extrae el texto legible conservando la estructura y guarda el resultado en caché para que la siguiente pregunta no vuelva a pagar ese coste.',
          'Un límite que conviene indicar: un archivo de más de unos 6 MB se omite en la extracción en lugar de enviarse al modelo. Si un conjunto de apuntes escaneados no aparece en las respuestas, el tamaño es lo primero que hay que comprobar.',
        ],
      },
      {
        heading: 'Un hilo por curso, más uno general',
        paragraphs: [
          'Las conversaciones están acotadas a un curso, que es lo que mantiene coherente el anclaje: un hilo de química orgánica no arrastra contexto de tu seminario de literatura.',
          'En cada turno se reproducen los últimos 12 mensajes de la conversación, unos seis intercambios de memoria de trabajo. Es suficiente para repreguntar sobre una explicación sin que el hilo acabe arrastrando una hora de contexto irrelevante en cada petición.',
          'También hay un hilo general para preguntas que no van de una materia concreta, donde se comporta como un asistente general competente y sin nada del anclaje del curso.',
        ],
      },
      {
        heading: 'Los límites, en números reales',
        paragraphs: [
          'Cincuenta mensajes al tutor por cada 24 horas móviles y por cuenta —móviles, no un reinicio a medianoche— y 4.000 caracteres por mensaje, aplicados en el campo de escritura y comprobados otra vez en el servidor.',
          'La llamada al modelo va a OpenAI GPT-5.6 Luna con razonamiento bajo y un techo de salida de 2.048 tokens: suficiente para una explicación desarrollada sin invitar a un ensayo. Si el proveedor devuelve un error reintentable, la función espera y reintenta hasta tres veces, así que ves un solo indicador de carga en lugar de un fallo.',
          'Las respuestas son texto plano por instrucción —párrafos cortos y viñetas, sin encabezados de markdown— que es un intercambio deliberado. Si lo que quieres es un documento largo con formato, esta no es la herramienta.',
          'El Tutor forma parte de Pro, a 3,99 USD al mes o 19,99 USD al año, comprado con tarjeta en la web o en la app de iOS y aplicado a toda la cuenta, incluida la web.',
        ],
        bullets: [
          '50 mensajes por cada 24 horas móviles, por cuenta',
          '4.000 caracteres por mensaje',
          '12 mensajes anteriores reproducidos por turno',
          'Respuestas limitadas a 2.048 tokens, en texto plano',
        ],
      },
      {
        heading: 'Para quién sirve de verdad',
        paragraphs: [
          'Sirve para las preguntas que necesitan tu contexto para responderse: qué dice mi programa que entra en el examen, cómo llamaban mis apuntes de la semana 3 a esto, qué vence de verdad antes del viernes, cómo trata mi escala un 88.',
          'Encaja mal si lo que quieres es un tutor general de una materia que estudias fuera de un curso registrado, porque el anclaje no tiene con qué trabajar. También encaja mal si buscas respuestas largas y con formato.',
          'Y aquí vale la misma regla que en el resto de la app: vale exactamente lo que tengas metido del semestre. Un curso con el programa escaneado, fechas reales y algunos apuntes subidos da respuestas útiles. Un curso vacío da un chatbot general.',
        ],
      },
    ],
    faq: [
      { question: '¿El Tutor conoce mis fechas de entrega reales?', answer: 'Sí, y esas las responde estrictamente desde tu lista de tareas registradas y no desde el razonamiento del modelo. Nunca inventa una fecha, y si algo no está en lo que le has dado, lo dice en lugar de adivinar.' },
      { question: '¿Conoce mis calificaciones?', answer: 'No. Las fechas que recibe llevan títulos, tipos, fechas, ponderaciones y si están hechas, pero no tus notas. Para saber qué necesitas en el examen final, usa las calculadoras de hipótesis del seguimiento de calificaciones.' },
      { question: '¿Cuántas preguntas puedo hacer?', answer: 'Cincuenta mensajes por cada 24 horas móviles y por cuenta, con un límite de 4.000 caracteres por mensaje. El límite es móvil, no se reinicia a medianoche.' },
      { question: '¿Puede leer mis apuntes de clase?', answer: 'Sí, en PDF o foto, asociados a un curso. Se leen los 10 archivos más recientes de cada curso, del más nuevo al más antiguo, compartiendo 24.000 caracteres de texto extraído. Los archivos de más de unos 6 MB se omiten en la extracción.' },
      { question: '¿Qué modelo usa?', answer: 'OpenAI GPT-5.6 Luna, con razonamiento bajo y un techo de 2.048 tokens de salida. Las respuestas son texto plano por instrucción: párrafos cortos y viñetas en lugar de documentos largos con formato.' },
      { question: '¿El Tutor con IA es gratis?', answer: 'No, forma parte de Pro, a 3,99 USD al mes o 19,99 USD al año, comprado con tarjeta en la web o en la app de iOS y aplicado a toda tu cuenta, incluida la web.' },
    ],
  }),
  page('/es/app-para-seguir-tareas', '/assignment-tracker-app', 'standard', {
    metaTitle: 'App para seguir tareas de la universidad',
    metaDescription: 'Una app de seguimiento de tareas que se rellena desde el programa: cada entrega con su ponderación y una nota ponderada al día. Plan gratuito, sin tarjeta.',
    h1: 'Una app de tareas que se rellena sola',
    lede: 'Casi todas las apps de tareas son una lista vacía que tienes que alimentar. Esta lee el programa de la materia, extrae cada entrega con su ponderación y te enseña lo que encontró antes de guardar nada.',
    intro: [
      'Sobre el papel, todas las apps de seguimiento de tareas hacen lo mismo: guardar una lista de lo pendiente, ordenarla por fecha y avisarte. La diferencia entre las que se siguen usando en noviembre y las que se abandonan en la semana seis no está en la lista de funciones, sino en cómo entran las tareas.',
      'Una app que rellenas a mano empieza vacía y solo sigue siendo exacta mientras la alimentes. Eso es cerca de una hora de mecanografía al empezar cada periodo, más una corrección cada vez que un profesor mueve una fecha. El mantenimiento cuesta más que el problema que resuelve, así que se deja de hacer, y una lista a medio mantener es peor que ninguna porque te fías de ella.',
      'Esta página trata de qué cambia cuando la lista se rellena desde el documento que ya contiene tu semestre, qué hace eso posible después, y en qué casos sinceramente no es la herramienta adecuada.',
    ],
    sections: [
      {
        heading: 'Tres formas de meter las tareas',
        paragraphs: [
          'La entrada manual funciona en cualquier sitio y no necesita configuración. También es el motivo por el que la mayoría de las agendas se abandonan: es trabajo recurrente sin final, y compite por las mismas horas que las propias asignaturas.',
          'La importación desde la plataforma académica elimina ese trabajo cuando está disponible. Refleja lo que el profesor publica dentro de la plataforma, lo cual es excelente si tus materias se gestionan por completo allí, y silencioso sobre todo lo demás. Las ponderaciones, las fechas de examen, el calendario de lecturas y la escala de calificación a menudo no llegan a ser entradas de la plataforma.',
          'La extracción desde el programa lee el documento que ya lo contiene todo. Un escaneo por materia, una pantalla de revisión, y el periodo está dentro. Es la única de las tres que captura las ponderaciones, que es lo que permite calcular una nota después.',
        ],
        bullets: [
          'Manual: sirve siempre, cuesta una hora por periodo más cada corrección',
          'Importación: elimina el tecleo, limitada a lo que el profesor publique allí',
          'Programa: una pasada por materia, y la única vía que captura ponderaciones',
        ],
      },
      {
        heading: 'Qué mete un escaneo en la lista',
        paragraphs: [
          'Fotografía el programa, sube el PDF, arrástralo en la web o pega el texto. Entre diez y treinta segundos después tienes el curso y el profesor, los horarios de clase y de atención, las fechas del semestre, la escala de calificación, y cada tarea, cuestionario, examen, proyecto y lectura que haya encontrado.',
          'Cada elemento llega con tres cosas que una entrada escrita a mano casi nunca tiene: fecha, hora si el programa la indicaba, y su peso sobre la nota final. La ponderación es la parte que más importa y la que nadie introduce a mano, porque teclear veinte fechas es tedioso pero teclear veinte ponderaciones al lado lo es más.',
          'Y ahí se detiene. Nada llega a tu lista hasta que miras lo extraído y lo apruebas. Lo de menor confianza queda marcado para que lo verifiques, las fechas fuera del semestre se señalan, y los elementos sin fecha se separan en lugar de asignarles una en silencio.',
        ],
      },
      {
        heading: 'Ordenar por fecha no es ordenar por lo que importa',
        paragraphs: [
          'Una lista corriente ordena por fecha de entrega, que es el valor por defecto correcto y una respuesta incompleta. Dos entregas del jueves no son igual de urgentes si una es una lectura del cinco por ciento y la otra vale la cuarta parte de tu nota.',
          'Como las ponderaciones salieron del programa, Semora puntúa cada elemento con fecha como su peso multiplicado por un factor de esfuerzo según el tipo: un examen cuenta el triple, un proyecto 2,5, un cuestionario 1,5, una tarea 1,2 y una lectura 1. Eso convierte una lista en una vista de carga capaz de avisarte de que una semana es pesada antes de estar dentro de ella.',
          'Ese es el rendimiento práctico de capturar las ponderaciones al entrar. Una lista que solo conoce fechas únicamente puede decirte qué viene después. Una que conoce pesos puede decirte qué merece tu tarde.',
        ],
      },
      {
        heading: 'Recordatorios que se programan solos',
        paragraphs: [
          'Los recordatorios el mismo día se programan automáticamente en cuanto apruebas las fechas extraídas, en el plan Gratis. No hay un recordatorio por elemento que configurar, y eso importa porque los recordatorios que la gente configura a mano son justo los que deja de configurar en la semana cuatro.',
          'Pro añade avisos de un día y de tres días. La distinción tiene que ver con el tamaño del trabajo y no con la preferencia: para una entrega corta, avisar esa mañana basta; para un proyecto que necesita seis horas, enterarte ese día no cambia nada. Tres días es la ventana en la que la información todavía sirve para algo.',
          'Si una fecha se mueve y la editas, el recordatorio se mueve con ella. Suena obvio y es una de las cosas que conviene probar de verdad en cualquier app que estés valorando.',
        ],
      },
      {
        heading: 'La lista y el boletín de notas son los mismos datos',
        paragraphs: [
          'Aquí es donde una app de tareas deja de ser una lista de pendientes. Cada elemento ya lleva su ponderación, así que introducir una nota convierte esa misma lista en una media ponderada al día, sin una segunda pantalla que mantener.',
          'El cálculo divide entre el peso que has cursado y no entre el peso total del semestre, que es lo que mantiene la cifra honesta en octubre. Tres trabajos corregidos que cubren el 45 % de la materia dan una nota sobre ese 45 %, y un examen final sin calificar que vale el 30 % nunca arrastra el número hacia cero.',
          'Las categorías funcionan como las describen los programas de verdad —Tareas 25 %, Cuestionarios 15, Exámenes 45, Proyecto 15— con descarte de las más bajas por categoría y letras según la escala del curso. Todo eso está en el plan Gratis.',
        ],
        bullets: [
          'Introduce una nota en un elemento y la media ponderada se actualiza',
          'Divide entre el peso cursado, no entre el peso total',
          'Categorías, descartes y letras incluidos en el plan Gratis',
        ],
      },
      {
        heading: 'Qué cubre el plan Gratis, con precisión',
        paragraphs: [
          'Seguimiento completo de entregas y tareas, sin tope de cuántas puede tener un curso. Calificaciones con medias ponderadas, completas. Recordatorios el mismo día. Unirte al Espacio de curso que comparta un compañero. Y una acción de IA para toda la vida de la cuenta: un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento.',
          'Los dos límites son de cursos añadidos a mano y de periodos, y se comportan distinto. El curso que añades a mano es un techo sobre cuánto puedes escribir tú dentro de un mismo periodo; lo que llega de Canvas no cuenta y no tiene tope. Un semestre es una línea más dura: una cuenta gratuita no puede iniciar un segundo periodo, así que no se renueva solo en enero.',
          'Pro elimina los tres por 3,99 USD al mes o 19,99 USD al año, comprado con tarjeta en la web o en la app de iOS y aplicado a toda la cuenta, web incluida. Pero si llevas cuatro materias o menos en un solo periodo y lo que necesitas es dejar de perder fechas y saber tu nota, el plan Gratis hace ese trabajo completo.',
        ],
      },
      {
        heading: 'Cuándo no es la herramienta adecuada',
        paragraphs: [
          'Si todas tus materias se gestionan por completo en la plataforma académica y tus profesores publican allí cada tarea con su fecha, la importación puede bastarte: Canvas es gratis y sin límite de clases, y Blackboard y Moodle son de Pro y dependen de la política de tu institución y escanear sería resolver un problema que no tienes.',
          'Si buscas un gestor general de tareas para trabajo, recados y estudios en un mismo sitio, una app construida alrededor de cursos, semestres y ponderaciones te va a parecer estrecha. Esa estrechez es exactamente lo que hace posible el cálculo de la nota, y es un intercambio real.',
          'Y esto no sirve para entregar. Subir los trabajos y escribir a los profesores sigue ocurriendo en la plataforma de tu universidad; esta es la capa que te dice qué viene y cuánto vale.',
        ],
      },
    ],
    faq: [
      { question: '¿Tengo que escanear algo para usarla como lista de tareas?', answer: 'No. Puedes crear un curso a mano y añadir tú las entregas, las subtareas y las notas: el calendario, la vista Hoy, los recordatorios y el cálculo de la nota se comportan igual con datos escritos a mano.' },
      { question: '¿Hay un límite de tareas que puedo seguir?', answer: 'No. Los límites del plan Gratis son de acciones de IA (una para toda la vida de la cuenta), cursos (hasta cuatro dentro de un semestre) y periodos (uno en total). Un curso puede tener tantas entregas como tenga en realidad.' },
      { question: '¿Funciona en iPhone, iPad y la web?', answer: 'Sí, con una sola cuenta y una sola base de datos que se sincronizan casi en tiempo real. Pro se compra con tarjeta en la web o en la app de iOS y se aplica a toda la cuenta, incluida la web.' },
      { question: '¿Qué pasa cuando un profesor mueve una fecha?', answer: 'Editas el elemento y la fecha, su recordatorio y su puesto en la puntuación de carga se mueven con él. Si la fecha vino de una importación, una resincronización actualiza título y fechas sin tocar lo que ya habías marcado como hecho.' },
      { question: '¿Puedo seguir tareas de una materia cuyo programa no trae fechas?', answer: 'Sí. Escanea lo que el programa sí tenga —curso, horario, escala— y añade las entregas según se anuncien. A nada de lo que viene después le importa si un elemento entró por escaneo o a mano.' },
    ],
  }),
  page('/es/seguimiento-de-tareas-de-blackboard', '/blackboard-assignment-tracker', 'standard', {
    metaTitle: 'Seguimiento de tareas de Blackboard',
    metaDescription: 'Sigue el trabajo de Blackboard con recordatorios reales y notas ponderadas. Importación en Pro donde tu institución la permita, o escaneo del programa gratis.',
    h1: 'Un seguimiento de Blackboard con recordatorios y una nota de verdad',
    lede: 'Blackboard guarda tu trabajo. No te dice que tres entregas caen en las mismas 48 horas, ni te avisa la noche anterior, ni te enseña qué le pasa a tu nota si te saltas una.',
    intro: [
      'Blackboard es donde publican tus profesores y donde entregas tú. Esos son los dos trabajos para los que está construido, y los hace. Lo que te deja a ti es la síntesis: reunir varias páginas de curso en una lista, ordenarla por lo que de verdad importa y no solo por fecha, y saber cuál de esas entregas mueve tu nota.',
      'Esa síntesis es el trabajo. Y es justo el que se salta en una semana cargada, que es como se acaban descubriendo tres fechas juntas en vez de por separado.',
      'Esta página trata de qué añade una capa de seguimiento sobre Blackboard, cómo funciona la importación y cuándo no deberías usarla, y qué cubre la vía gratuita para quien estudie en una institución que no permite conexiones de terceros.',
    ],
    sections: [
      {
        heading: 'Qué te da Blackboard y qué deja fuera',
        paragraphs: [
          'Páginas de curso, anuncios, entrega y las notas que tu profesor decida publicar. Existen notificaciones, pero están pensadas para avisar de que algo cambió en la plataforma, no para preparar tu semana.',
          'Los huecos que importan para planificar se repiten de una institución a otra. Suele no haber una vista única entre materias ordenada por urgencia, ni un aviso con antelación que controles tú, ni una nota ponderada al día en la que puedas confiar salvo que tu profesor configurara el boletín con cuidado, cosa que muchos no hacen.',
          'Lo de la nota merece énfasis. Que una nota de Blackboard signifique algo depende de si se configuraron las categorías y sus pesos, de si el trabajo sin calificar cuenta como cero, y de si las notas están publicadas u ocultas. Dos materias del mismo periodo difieren habitualmente en las tres cosas.',
        ],
      },
      {
        heading: 'Importar desde Blackboard, y cuándo no hacerlo',
        paragraphs: [
          'La importación desde Blackboard y Moodle es una función Pro, y Canvas es gratis que cubre Blackboard, Canvas y Moodle. La configuración varía bastante según la institución: las instalaciones de Blackboard difieren en versión, en ajustes y en qué integraciones permite cada centro.',
          'Antes de conectar nada, confirma la política de tu institución sobre el acceso de terceros. Algunas lo permiten, otras lo restringen y otras lo prohíben directamente en sus normas de uso. Si no está permitido, no lo conectes, y no habrás perdido nada, porque la vía gratuita de abajo cubre el mismo trabajo.',
          'Se dice claramente en lugar de enterrarlo porque es la posición honesta: la disponibilidad del conector no está del todo en manos de la app, y una herramienta que solo funciona si tu universidad coopera no es algo con lo que debas jugártela.',
        ],
        bullets: [
          'La importación de Blackboard y Moodle es parte de Pro, mientras que Canvas es gratis',
          'La configuración varía según la institución y la versión',
          'Confirma la política de tu centro antes de conectar; si hay dudas, usa la vía gratuita',
        ],
      },
      {
        heading: 'La vía gratuita: escanear el programa o pegar la lista',
        paragraphs: [
          'El programa suele contener más de lo que necesitas para planificar que la propia plataforma. Las ponderaciones, las fechas de examen, el calendario de lecturas y la escala de calificación viven ahí, y buena parte de eso nunca llega a ser una entrada de Blackboard.',
          'Fotografíalo, sube el PDF, arrástralo en la web o pega el texto —hasta 60.000 caracteres, que es la vía más rápida y precisa cuando puedes seleccionar el texto en un portátil. Obtienes el curso, el profesor, los horarios, las fechas del semestre, la escala y cada elemento con fecha y ponderación.',
          'También puedes pegar directamente una lista de tareas de Blackboard en el mismo escáner. Si puedes seleccionar el texto, se puede leer, y no hay ninguna conexión ni token de por medio.',
          'El plan Gratis incluye una acción de IA para toda la vida de la cuenta —tu primer escaneo, por ejemplo—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre, un semestre en total, seguimiento completo de entregas, calificaciones ponderadas y recordatorios el mismo día.',
        ],
      },
      {
        heading: 'Recordatorios que controlas tú',
        paragraphs: [
          'Los recordatorios el mismo día se programan solos en cuanto apruebas las fechas extraídas, sin coste. Pro añade avisos de un día y de tres.',
          'El motivo para que te importe la antelación es el tamaño del trabajo, no la preferencia. Una intervención corta en el foro se resuelve con un aviso esa mañana. Un trabajo que necesita seis horas no: para cuando te avisan, la única respuesta posible es empezar tarde.',
          'Como los recordatorios se derivan de las fechas y no se configuran uno a uno, sobreviven a lo que mata a los sistemas hechos a mano: nadie tiene que acordarse de ponerlos.',
        ],
      },
      {
        heading: 'Una nota que puedes contrastar con el programa',
        paragraphs: [
          'Semora calcula la suma ponderada de tus notas dividida entre el peso que has cursado, no entre el peso total del semestre. Eso mantiene el número con sentido a mitad de periodo, cuando un examen final sin calificar que vale el 30 % lo arrastraría hacia cero.',
          'Admite la estructura que los programas usan de verdad: categorías con sus porcentajes, descarte de las notas más bajas por categoría de 0 a 20 que nunca elimina tu última nota, tres políticas distintas de crédito extra, y letras según la escala de tu curso. Todo eso está en el plan Gratis.',
          'Editar los cortes de letra para que coincidan con la escala de tu institución, y las calculadoras de hipótesis que dicen qué necesitas en lo que queda, son de Pro.',
        ],
      },
      {
        heading: 'Qué toca y qué no toca una resincronización',
        paragraphs: [
          'Si acabas conectándolo, el comportamiento al actualizar importa más que el de la primera importación, porque ahí es donde estas herramientas corrompen un semestre sin avisar.',
          'Una resincronización actualiza el título y las fechas de un elemento en su sitio. No toca tu estado de completado, ni las notas que introdujiste, ni las subtareas que añadiste. Lo que marcaste como hecho sigue hecho.',
          'Esa es la prueba más útil que puedes hacerle a cualquier herramienta que estés valorando: mueve una fecha, resincroniza y comprueba que el elemento se actualizó en lugar de duplicarse, que el recordatorio sigue la fecha nueva y que tus marcas sobrevivieron.',
        ],
      },
      {
        heading: 'Quién debería saltarse esto',
        paragraphs: [
          'Si tus profesores lo publican todo en Blackboard con fechas exactas y tu institución muestra una nota ponderada que consultas y en la que confías, una capa de seguimiento sobra. Usa la plataforma.',
          'Si necesitas entregar trabajos o escribir a un profesor, eso sigue ocurriendo en Blackboard en cualquier caso. Esta es una capa de organización por encima, no un sustituto del campus virtual.',
          'Y si tu institución prohíbe las conexiones de terceros y tampoco quieres escanear programas, la respuesta honesta es que esto no es para ti: el valor depende de que los datos entren por una vía o por la otra.',
        ],
      },
    ],
    faq: [
      { question: '¿La importación desde Blackboard es gratis?', answer: 'No. La importación desde plataformas académicas —Blackboard, Canvas y Moodle— forma parte de Pro, a 3,99 USD al mes o 19,99 USD al año. El plan Gratis cubre el mismo trabajo desde el programa, incluido pegar una lista de tareas de Blackboard en el escáner.' },
      { question: '¿Funcionará la conexión con Blackboard en mi universidad?', answer: 'Depende de tu institución. Las instalaciones de Blackboard varían en versión y configuración, y los centros difieren en si permiten el acceso de terceros. Confirma la política de tu centro primero y usa la vía del programa si no está permitido.' },
      { question: '¿Puedo usarlo sin conectar nada?', answer: 'Sí, y la mayor parte del valor no necesita conexión. Escanea el programa o pega tu lista de tareas y tendrás fechas, ponderaciones, recordatorios y seguimiento de calificaciones en el plan Gratis.' },
      { question: '¿Sustituye a Blackboard?', answer: 'No. Las entregas, los mensajes al profesor y los materiales del curso siguen en Blackboard. Semora añade la vista de fechas entre materias, recordatorios que controlas tú y una nota ponderada calculada con los pesos que indica tu programa.' },
      { question: '¿Funciona en iPhone, iPad y la web?', answer: 'Sí, con una sola cuenta que se sincroniza en los tres. Pro se compra con tarjeta en la web o en la app de iOS y se aplica a toda la cuenta, web incluida.' },
    ],
  }),
  page('/es/escaner-de-programa-de-estudios', '/ai-syllabus-scanner', 'standard', {
    metaTitle: 'Escáner de programas de clase con IA',
    metaDescription: 'Extrae tareas, exámenes, horarios y ponderaciones a partir de fotos, PDFs o texto, y revisa todo antes de guardar.',
    h1: 'Convierte el programa de una materia en un semestre organizado',
    lede: 'Sube el documento una vez. La IA de Semora identifica la estructura académica y te permite comprobar cada resultado.',
    intro: ['Las fechas pueden aparecer en tablas, párrafos, calendarios o notas al pie. Copiarlas a mano lleva tiempo y es fácil equivocarse. Semora convierte ese contenido en información que puedes revisar antes de guardarla.'],
    sections: [
      {
        heading: 'Qué es un escáner de programas y qué resuelve exactamente',
        paragraphs: [
          'Un escáner de programas es una herramienta que lee el texto sin estructura del programa de una materia —un PDF, una hoja escaneada, una foto— y lo convierte en datos utilizables: un horario de clases, un desglose de la calificación y una lista de cada fecha de entrega.',
          'El problema que ataca es concreto y muy medible. Cuatro o cinco programas de ocho a veinte páginas cada uno, en la primera semana, con las fechas repartidas entre la política de asistencia y el apartado de integridad académica. Copiarlo todo a mano es cerca de una hora de mecanografía por semestre, y es exactamente el trabajo que hace que la mayoría de las agendas se abandonen en la semana seis.',
          'Semora aplica esto al programa de un estudiante universitario, usando OpenAI GPT-5.6 Luna para leer el documento y extraer los detalles que de verdad afectan a un semestre: no un resumen del texto, sino filas con las que después se puede calcular.',
        ],
      },
      {
        heading: 'Las cuatro vías de entrada en el móvil y las dos de la web',
        paragraphs: [
          'La pantalla de escaneo es una sola pantalla con una lista corta de opciones, porque la entrada nunca es igual dos veces. A veces el programa es un PDF en tu correo. A veces es un papel grapado que el profesor repartió en clase. A veces es una página del campus virtual de la que solo puedes copiar el texto.',
          'Los escaneos con foto admiten hasta cinco páginas, y las cinco cuentan como un único escaneo. Los PDF se leen completos, sin tope de páginas, así que un programa largo conviene subirlo como PDF y no como fotos. En la web, además, puedes arrastrar el archivo sobre el marco de escaneo o pegar texto directamente.',
          'Pegar texto es la vía más rápida y precisa de todas cuando estás en un portátil y puedes seleccionar el contenido del PDF: se salta por completo la lectura de imagen y envía el texto tal cual. Admite entre 20 y 60.000 caracteres, con un contador en pantalla.',
        ],
        bullets: [
          'Tomar una foto: hasta 5 páginas por escaneo, capturadas de una en una',
          'Subir PDF: el documento entero, sin tope de páginas',
          'Elegir de Fotos: selección múltiple de hasta 5 imágenes, en tu orden',
          'Archivos: PDF, JPG, PNG, HEIC, HEIF y WEBP desde iCloud, Drive o donde llegue la app Archivos',
          'Web: arrastrar y soltar sobre el marco, o pegar entre 20 y 60.000 caracteres de texto',
        ],
      },
      {
        heading: 'Qué sale realmente de la página',
        paragraphs: [
          'La extracción no es un muro de texto con las fechas resaltadas. Al modelo se le pide un único objeto estructurado con campos con nombre, y cada campo se valida en el servidor antes de llegar a ti, de modo que un valor mal formado se convierte en un vacío y no en una fila corrupta dentro de tu curso.',
          'De un programa completo salen el nombre del curso y el profesor, los días, horas y aulas de clase, las horas de atención, las fechas de inicio y fin del semestre, la escala de calificación con sus cortes, y cada tarea, cuestionario, examen, proyecto y lectura con su fecha, su hora si estaba indicada y su peso sobre la nota final.',
          'Ese último dato —la ponderación— es el que convierte el escaneo en algo más que una lista. Es lo que permite después calcular una media ponderada real, puntuar la carga de una semana y decidir qué estudiar primero.',
          'También hay un tope de tamaño, y se aplica mientras capturas y no al final. El tamaño combinado en bruto de un escaneo con fotos se presupuesta en 10 MB: la primera página siempre entra, y si una posterior fuera a superar el presupuesto, se descarta y se te dice con cuántas páginas continuará el escaneo.',
        ],
      },
      {
        heading: 'Nada se guarda hasta que lo apruebas',
        paragraphs: [
          'Este es el punto en el que el producto se juega la confianza, así que conviene ser explícito. El curso, sus horarios y su escala de calificación quedan archivados al crear el curso. Ninguna entrega se guarda hasta que miras la lista y la apruebas.',
          'La pantalla de revisión no se limita a mostrarte lo extraído. Lo que el modelo devolvió con menos confianza aparece marcado para que lo verifiques, las fechas que caen fuera del rango del semestre se señalan como sospechosas, y los elementos que llegaron sin fecha se separan y quedan desactivados hasta que los corrijas.',
          'El motivo de diseño es sencillo: una IA que archiva fechas en tu nombre sin enseñártelas crea un problema peor que el tecleo que sustituye, porque una fecha equivocada en la que confías es más cara que una fecha que nunca tuviste. Revisar cuatro programas lleva unos minutos; descubrir en noviembre que un parcial estaba mal ubicado, no.',
        ],
      },
      {
        heading: 'Qué construye Semora a partir de la extracción',
        paragraphs: [
          'Una vez aprobadas, las fechas dejan de ser una lista y pasan a alimentar el resto de la app sin que introduzcas nada dos veces.',
          'Aparecen en la vista Hoy, que muestra lo siguiente que vence y lo que ya está atrasado. Aparecen en el Calendario, en vista de mes o de lista, con un color por curso. Generan recordatorios el mismo día de forma automática al aprobarlas. Y las ponderaciones preparan el seguimiento de calificaciones, de modo que en cuanto introduzcas una nota exista una media ponderada real.',
          'Por encima de esa capa hay análisis. El motor de carga académica puntúa cada tarea con fecha como su ponderación multiplicada por un factor de esfuerzo —un examen cuenta el triple, un proyecto 2,5, un cuestionario 1,5, una tarea 1,2 y una lectura 1— así que una semana con dos exámenes se lee como pesada aunque el profesor no imprimiera ningún porcentaje al lado. El Plan Inteligente reparte sesiones de estudio en un horizonte de catorce días esquivando las clases que el escaneo ya conoce.',
          'La consecuencia práctica: el escaneo no es el producto, es el paso de entrada. Cada función de planificación y estudio vale exactamente lo que tengas metido del semestre.',
        ],
      },
      {
        heading: 'Reescanear un programa revisado',
        paragraphs: [
          'Los profesores publican versiones nuevas, y el comportamiento en ese caso está decidido a propósito. Escanear un programa revisado sobre un curso que ya tienes incorpora las entregas nuevas, pero no reescribe lo que ya tocaste.',
          'En concreto: las filas de clases y de horas de atención solo se escriben al crear el curso, y la escala de calificación se sustituye únicamente si la dejaste como estaba por defecto. Una revisión que cambia el aula, o que convierte un parcial del 30 % en uno del 25 %, llega como entregas y nada más; el horario y la escala los actualizas tú desde la pantalla del curso.',
          'Es un intercambio deliberado, y merece conocerse antes de que ocurra: la app prefiere conservar tus correcciones a sobrescribirlas con una suposición nueva.',
        ],
      },
      {
        heading: 'El límite gratuito, dicho con precisión',
        paragraphs: [
          'El plan Gratis incluye una acción de IA completada para toda la vida de la cuenta: un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento, la que necesites primero. Un escaneo con foto de hasta cinco páginas cuenta como uno solo, así que el programa entero de una materia cabe dentro de esa única acción.',
          'Los otros dos límites son los que conviene entender antes de empezar, porque funcionan distinto. El curso que añades a mano es un techo sobre cuánto puedes escribir tú dentro de un mismo periodo; lo que llega de Canvas no cuenta y no tiene tope. Un semestre es una línea más dura: una cuenta gratuita no puede iniciar un segundo periodo, así que el tope no se renueva solo en enero.',
          'Dentro de esos límites tienes la capa de organización completa: seguimiento de tareas y fechas, calificaciones con medias ponderadas, recordatorios el mismo día y la posibilidad de unirte al Espacio de curso de un compañero. Pro elimina los tres topes por 3,99 USD al mes o 19,99 USD al año, se compra con tarjeta en la web o dentro de la app de iOS, y se aplica a toda la cuenta, incluida la web.',
        ],
      },
      {
        heading: 'Cuándo un escáner no es la respuesta',
        paragraphs: [
          'Si todas tus materias se gestionan por completo en el campus virtual y tus profesores publican allí cada tarea con su fecha, la importación desde la plataforma puede bastarte y el escaneo sobra. Esa importación de Blackboard y Moodle es una función Pro y depende de que tu institución permita el uso de un token de acceso personal.',
          'Si tu programa no lleva fechas —hay asignaturas que solo anuncian las entregas en clase— el escáner no puede inventarlas. Extraerá el curso, el horario y la escala, y las entregas las irás añadiendo tú a mano, que es algo que la app admite igual de bien.',
          'Y si lo que buscas es generar material de estudio a partir de una lectura concreta, ese es otro trabajo. Sostener un semestre y fabricar tarjetas de un capítulo son problemas distintos, y conviene resolver primero el que más te cueste.',
        ],
      },
    ],
    faq: [
      { question: '¿Puede leer un PDF escaneado?', answer: 'Sí. Los archivos PDF y las imágenes compatibles se procesan visualmente. Para obtener mejores resultados, procura que las páginas salgan nítidas, sin inclinación y bien iluminadas.' },
      { question: '¿Guarda algo sin preguntarme?', answer: 'No. Primero revisas y editas el resultado; luego eliges qué guardar.' },
      { question: '¿Cuántos escaneos son gratis?', answer: 'Uno. El plan Gratis trae una sola acción de IA para toda la vida de la cuenta y puedes gastarla en un escaneo; no se renueva cada mes. Pro elimina el límite.' },
    ],
  }),
  page('/es/planificador-de-estudio-con-ia', '/ai-study-planner-for-college', 'standard', {
    metaTitle: 'Planificador de estudio con IA para la universidad',
    metaDescription: 'Crea un plan adaptativo desde tus fechas reales, hábitos, exámenes, calificaciones y tiempo disponible.',
    h1: 'Un plan de estudio que aprende de tu semestre',
    lede: 'Plan Inteligente distribuye trabajo antes de las fechas importantes, reajusta lo que no completaste y explica cada cambio.',
    intro: ['Una lista de tareas solo te dice qué tienes pendiente. Un plan útil también decide cuándo empezar, cuánto tiempo reservar y qué mover cuando la semana cambia.'],
    sections: [
      {
        heading: 'Una lista de entregas no es un plan',
        paragraphs: [
          'Una lista te dice que un parcial que vale el 25 % cae el día 14 y que un informe de laboratorio cae el 16. No te dice qué tarde vas a sentarte de verdad, durante cuánto tiempo, ni con cuál de los dos empiezas.',
          'Ese hueco es donde se tuercen la mayoría de los semestres. No se olvida nada, todo está anotado, y aun así el trabajo se acumula contra la fecha porque nunca hubo un momento asignado para hacerlo. La sensación de ir al día que da una lista bien mantenida es precisamente lo que la hace peligrosa.',
          'Un planificador de estudio resuelve el otro problema: convertir fechas en sesiones con día, hora y duración. El Plan Inteligente de Semora hace eso con datos que la app ya tiene, y lo reconstruye entero cada vez que lo abres.',
        ],
      },
      {
        heading: 'Cómo se construyen tus próximos catorce días',
        paragraphs: [
          'El horizonte de planificación es de catorce días a partir de hoy. Todo lo que cae dentro de esa ventana se calcula con una pasada directa y repetible sobre tus datos: no hay llamada a un modelo ni ida y vuelta a la red en la programación en sí, y por eso las mismas entradas producen siempre el mismo plan.',
          'El planificador avanza día a día. Salta el día entero si tienes los fines de semana desactivados y es sábado o domingo. Si no, coloca un cursor al inicio en tu hora de comienzo entre semana o de fin de semana, y hoy en concreto en la más tardía de las dos: tu hora de inicio o la hora actual redondeada.',
          'El tiempo bloqueado incluye tus clases y, si tienes activada la opción de evitar conflictos, los eventos del calendario del dispositivo para esa fecha, con diez minutos de margen a cada lado. También incluye cualquier sesión que ya hayas completado ese día, reservada desde su inicio hasta su fin más diez minutos, para que una reconstrucción nunca apile trabajo nuevo encima de trabajo terminado.',
        ],
      },
      {
        heading: 'Cuánto cree que va a costarte cada cosa',
        paragraphs: [
          'Cada tarea lleva un campo de esfuerzo estimado con opciones de estimación automática, 30 m, 1 h, 2 h, 3 h, 4 h y 8 h. Si pones un número real de quince minutos o más, ese número manda sin discusión: es tu tarea y la conoces mejor que cualquier heurística.',
          'Con la estimación automática, el planificador parte de una base según el tipo de tarea —45 minutos para una lectura, 60 para otras, 75 para un cuestionario, 90 para una tarea, 240 para un examen y 360 para un proyecto— y la escala según la ponderación que el escaneo sacó de tu programa.',
          'Así, un parcial que vale el 30 % de la nota se lee como 240 × 1,5, es decir seis horas de preparación repartidas entre los días que queden. Una lectura del cinco por ciento se lee como 45 minutos. Nada de esto está oculto: cambia el tipo o la ponderación de la tarea y la estimación cambia contigo.',
        ],
        bullets: [
          'Un número propio de 15 minutos o más siempre gana a la heurística',
          'Bases por tipo: lectura 45, otras 60, cuestionario 75, tarea 90, examen 240, proyecto 360',
          'La base se escala según la ponderación que llevaba el programa',
        ],
      },
      {
        heading: 'Qué se programa primero, y por qué',
        paragraphs: [
          'El orden es donde un planificador se gana el sueldo, porque cuando los días están llenos algo tiene que perder.',
          'Cada tarea recibe una puntuación de carga igual a su ponderación multiplicada por un factor de preparación según el tipo: 3 para un examen, 2,5 para un proyecto, 1,5 para un cuestionario, 1,2 para una tarea y 1 para una lectura. Esa puntuación se multiplica después por la prioridad que le hayas puesto —1,55 para alta, 0,78 para baja, sin cambio para normal— y se divide por lo lejos que queda la fecha, con un suelo para que algo que vence hoy no divida entre cero.',
          'Por último se añade un término de ritmo: los minutos que le quedan a la tarea divididos entre el número de días de estudio disponibles. Eso evita que un proyecto grande y lejano se quede sin empezar hasta que ya es tarde.',
          'Dentro de un mismo día, cada tarea acumula una porción de su trabajo restante igual a los minutos pendientes divididos entre los días disponibles, redondeada hacia abajo a múltiplos de quince minutos. Un proyecto de ocho horas que vence en diez días aparece por tanto como una sesión de 30 minutos hoy y de 45 en cada día siguiente.',
        ],
      },
      {
        heading: 'Los ajustes que de verdad controlas',
        paragraphs: [
          'La capacidad diaria de estudio se elige entre 1 h, 1 h 30 m, 2 h y 3 h, y por defecto es 1 h 30 m. Es el tope de trabajo que el planificador colocará en un día, y es el ajuste que más cambia el resultado.',
          'Las horas de comienzo se fijan por separado para entre semana —17:00 por defecto— y para el fin de semana —10:00 por defecto—, ambas con un selector de hora. Los fines de semana se pueden desactivar por completo, y en ese caso el planificador reparte el mismo trabajo entre menos días, lo cual es exactamente lo que debe hacer.',
          'Evitar conflictos con el calendario del dispositivo viene activado por defecto, con diez minutos de margen a cada lado de cada evento. La duración de sesión ofrece 25, 45 o 50 minutos y por defecto son 45, que son tres de las cuatro duraciones del temporizador de enfoque; esa coincidencia es intencionada, para que una sesión planificada se pueda arrancar tal cual.',
        ],
        bullets: [
          'Capacidad diaria: 1 h, 1 h 30 m, 2 h o 3 h (por defecto 1 h 30 m)',
          'Inicio entre semana 17:00 y fin de semana 10:00, ajustables',
          'Fines de semana desactivables',
          'Margen de 10 minutos alrededor de cada evento del calendario',
          'Duración de sesión: 25, 45 o 50 minutos (por defecto 45)',
        ],
      },
      {
        heading: 'Cuando una fecha se mueve o te saltas una sesión',
        paragraphs: [
          'El plan se reconstruye entero en cada visita, así que no hay que arreglar nada a mano. Una sesión que no hiciste ayer no se queda ahí como un pendiente caducado: el trabajo que representaba vuelve a repartirse entre los días que quedan hasta la fecha.',
          'Lo mismo ocurre cuando un profesor mueve una entrega. La tarea cambia de fecha, su denominador de urgencia cambia con ella, y el reparto se rehace. No hay un plan «anterior» que corregir.',
          'El caso que sí se te comunica es el de no llegar. Si el trabajo que vence dentro de la ventana de catorce días no cabe en tu capacidad, aparece un aviso ámbar que dice exactamente cuántos minutos quedan sin programar y nombra las dos soluciones reales: subir la capacidad diaria o bajar las estimaciones. Esconder ese caso sería lo fácil; decirlo es lo útil.',
        ],
      },
      {
        heading: 'La carga académica es la misma información alejada',
        paragraphs: [
          'El Plan Inteligente cubre catorce días. La vista de carga académica, también incluida en Pro, cubre el semestre entero, y en la primera semana de un periodo es sinceramente la más útil de las dos, cuando todavía no hay nada urgente.',
          'Puntúa cada semana con la misma fórmula de ponderación por factor de esfuerzo y señala las semanas cargadas y las densas en exámenes antes de que lleguen. Es la vista que responde a «¿cuándo va a ponerse fea esta materia?», que es una pregunta que solo se puede aprovechar con semanas de antelación.',
          'Las dos leen los mismos datos: las tareas con fecha y ponderación que salieron de tus programas. Sin eso, ninguna de las dos tiene sobre qué razonar.',
        ],
      },
      {
        heading: 'Para quién sirve y para quién no',
        paragraphs: [
          'Sirve si tu problema es la asignación de tiempo y no la memoria: sabes lo que debes, pero llegas a la semana del parcial sin haber empezado. Sirve si llevas varias materias con ponderaciones muy distintas y no tienes claro cuál merece la tarde de hoy.',
          'No sirve igual de bien si tu carga es ligera y previsible: con dos materias y entregas semanales, un plan generado añade estructura donde no hacía falta. Tampoco sustituye la decisión de qué estudiar dentro de la sesión; te dice cuándo y cuánto, no qué es lo importante del capítulo.',
          'Y no arregla un problema de volumen. Si tienes cuarenta horas de trabajo y quince disponibles, ninguna estructura cierra esa brecha: lo que hace falta es recortar alcance o pedir una prórroga, y el aviso ámbar existe precisamente para que eso se vea pronto.',
          'El Plan Inteligente forma parte de Pro, a 3,99 USD al mes o 19,99 USD al año, comprado con tarjeta en la web o dentro de la app de iOS y aplicado a toda la cuenta, incluida la web.',
        ],
      },
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
      {
        heading: 'Qué hace Canvas bien y qué deja sin hacer',
        paragraphs: [
          'Canvas ya sabe cada tarea que tus profesores publicaron. Lo que no hace es decirte que tres de ellas caen en las mismas 48 horas, ni recordártelo la noche anterior, ni enseñarte qué le pasa a tu nota si te saltas una intervención en el foro.',
          'Te da seis páginas de curso y te deja a ti la síntesis. Y la síntesis es justamente el trabajo: reunir seis listas en una, ordenarla por urgencia real y no por fecha, y saber cuál de esas entregas mueve la nota.',
          'Semora es esa capa. No sustituye a Canvas —ahí siguen estando las entregas y los mensajes al profesor— sino que toma lo que Canvas contiene y le añade recordatorios, cálculo de calificaciones ponderadas, y planificación.',
        ],
      },
      {
        heading: 'Cómo se conecta, y cuándo no deberías conectarte',
        paragraphs: [
          'La importación desde Blackboard y Moodle es una función Pro, y Canvas es gratis. El conector actual de Canvas usa un token de acceso personal que generas tú mismo dentro de Canvas.',
          'Aquí hay una advertencia que conviene leer entera. Algunas instituciones desactivan la creación de tokens, y otras la permiten técnicamente pero prohíben en su normativa el uso por parte de terceros. Confirma la política de tu centro antes de conectar nada; si no está permitido, no lo hagas.',
          'La alternativa cubre el mismo trabajo y además es gratuita: escanea el programa de la materia, o pega la lista de tareas de Canvas directamente en el escáner. Si tu profesor mantiene las fechas en el programa y no en la plataforma, escanear es de todos modos el mejor camino.',
        ],
      },
      {
        heading: 'Qué se importa de cada curso',
        paragraphs: [
          'Al pulsar «Buscar mis cursos», Semora pide a Canvas solo tus matrículas activas. Las materias que abandonaste y los semestres terminados que siguen en tu cuenta no aparecen, lo que te ahorra pasar por delante de las clases del año pasado para encontrar las de este.',
          'Cada curso que conserves se convierte en un curso real de Semora, no en un espejo de solo lectura. Recibe un color de un conjunto rotativo de seis, un icono y un enlace permanente a su equivalente en Canvas, y a partir de ahí se comporta como cualquier otro curso: puedes editarlo, añadir entregas a mano y registrar notas.',
          'De cada tarea se traen el título, la fecha y hora convertidas al reloj local de tu dispositivo a partir de la marca de tiempo absoluta que devuelve Canvas —de modo que una entrega a las 23:59 sigue siendo a las 23:59 y no se desplaza por tu diferencia horaria— y los puntos.',
          'Semora además deduce un tipo para cada elemento, para que tu calendario no sea un muro indistinto de «tarea». Si Canvas marca la entrega como cuestionario, se convierte en cuestionario. Si no, se mira el título: parcial, final, examen o prueba se convierten en examen; proyecto en proyecto; y así sucesivamente.',
        ],
      },
      {
        heading: 'Qué no sobrescribe una sincronización',
        paragraphs: [
          'Esta es la parte que decide si puedes confiarle un semestre a una importación automática, así que está diseñada de forma conservadora.',
          'Una resincronización actualiza el título y las fechas de una tarea, pero nunca toca tu estado de completado. Lo que marcaste como hecho sigue marcado. Las notas que introdujiste siguen ahí. Las subtareas que añadiste no se borran.',
          'Hay un detalle que merece mención porque es fácil hacerlo mal: si Canvas no puede aportar una marca de tiempo de entrega fiable, Semora deja la hora de completado como desconocida en lugar de estampar la hora de sincronización. Usar la hora de sincronización haría que un trabajo entregado a tiempo pareciera tardío, y esa clase de error es peor que no tener el dato.',
          'Puedes forzar una sincronización cuando quieras: cada conexión tiene un botón que informa exactamente de qué pasó, cuántas tareas se actualizaron y cuántas se omitieron por no tener una fecha utilizable.',
        ],
      },
      {
        heading: 'Recordatorios que Canvas no te da',
        paragraphs: [
          'Las notificaciones de Canvas están pensadas para avisar de actividad en la plataforma, no para preparar tu semana. Semora añade una capa de recordatorios sobre las mismas fechas.',
          'El plan Gratis incluye recordatorios el mismo día, que se programan solos en cuanto apruebas las fechas. Pro añade avisos con antelación personalizada, de un día y de tres días, que es la ventana en la que todavía se puede hacer algo con la información.',
          'La diferencia práctica se nota con los trabajos grandes. Un aviso el mismo día sirve para una entrega corta; para un proyecto que necesita seis horas, enterarte esa mañana no cambia nada. Los tres días son los que permiten reaccionar.',
        ],
      },
      {
        heading: 'Calificaciones: lo que Canvas muestra y lo que no',
        paragraphs: [
          'Muchos cursos de Canvas muestran una nota, pero no siempre es la que crees. Depende de si el profesor configuró los grupos de tareas con sus porcentajes, de si las entregas sin calificar cuentan como cero, y de si ha publicado las notas o las tiene ocultas.',
          'Semora calcula la media sobre el trabajo que de verdad se ha corregido: la suma ponderada de tus notas dividida entre el peso que has cursado, no entre el peso total del semestre. Eso mantiene la cifra honesta en octubre, cuando un examen final sin calificar que vale el 30 % la arrastraría hacia cero.',
          'Admite además categorías con sus pesos, descartar las notas más bajas por categoría, tres políticas distintas de crédito extra y letras según la escala de tu curso. Todo eso está en el plan Gratis. Editar los cortes de la escala y usar las calculadoras de hipótesis forman parte de Pro.',
        ],
      },
      {
        heading: 'Qué cuesta y para quién no vale la pena',
        paragraphs: [
          'La importación desde Canvas, Blackboard y Moodle es Pro: 3,99 USD al mes o 19,99 USD al año, comprado con tarjeta en la web o dentro de la app de iOS y aplicado a toda la cuenta, incluida la web. Una sincronización cubre hasta 50 cursos a la vez.',
          'El plan Gratis cubre buena parte de ese mismo trabajo desde el lado del programa: una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre, seguimiento completo de tareas y fechas, calificaciones con medias ponderadas y recordatorios el mismo día.',
          'No vale la pena si tu profesor no publica en Canvas y lo mantiene todo en el programa: ahí escanear es mejor, y el primero es gratis. Tampoco si lo que buscas es entregar trabajos o escribir a tu profesor, porque eso sigue ocurriendo en Canvas. Y si tu institución no permite el uso de tokens por terceros, la respuesta correcta es no conectarlo y usar el escáner.',
        ],
      },
    ],
    faq: [
      { question: '¿La conexión funciona en todas las universidades?', answer: 'No. El conector actual usa un token de acceso personal de Canvas, y algunas instituciones desactivan esos tokens o prohíben compartirlos con servicios externos. Confirma la política de tu universidad; si no está permitido, usa el escáner de programas o pega la lista de tareas de Canvas.' },
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
    why: 'Una lista de calificaciones no muestra cuánto vale cada actividad ni qué parte del curso ya se calificó. El promedio ponderado sí.',
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
    steps: ['Para Canvas, usa el conector Pro con token personal solo si tu institución permite introducirlo en un servicio externo.', 'Relaciona cada curso de tu plataforma con el curso correspondiente en Semora.', 'Elige entre sincronización manual y automática.', 'Consulta la última actualización y cualquier error.'],
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
      faq: long.faq,
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
      { heading: feature.tier === 'pro' ? 'Incluido con Semora Pro' : 'Incluido en el plan Gratis', paragraphs: [feature.tier === 'pro' ? 'Crea una cuenta gratuita y prueba el escaneo de programas, los cursos y las calificaciones antes de pasarte a Pro.' : 'Puedes empezar sin tarjeta de crédito. El plan Gratis incluye una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total.'] },
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
    modifiedDate: '2026-08-09',
    image: '/illustrations/syllabus-calendar.svg',
    imageAlt: 'Ilustración de la página de un programa que se convierte en un calendario con una fecha de entrega marcada',
  },
  {
    path: '/es/blog/calcular-gpa-ponderado',
    englishPath: '/blog/weighted-gpa-calculator',
    title: 'Cómo calcular una calificación ponderada',
    description: 'La fórmula para una materia, con categorías, reglas de eliminar la nota más baja, redondeo y ejemplos resueltos.',
    date: '21 de julio de 2026',
    isoDate: '2026-07-21',
    modifiedDate: '2026-08-09',
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
    modifiedDate: '2026-08-09',
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
    modifiedDate: '2026-08-09',
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
    modifiedDate: '2026-08-09',
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
    modifiedDate: undefined,
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
    modifiedDate: '2026-08-09',
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
    modifiedDate: '2026-08-09',
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
    modifiedDate: undefined,
    image: '/illustrations/final-grade-target.svg',
    imageAlt: 'Ilustración de un medidor que se llena hasta la nota que necesitas en el examen final',
  },
] as const;

/**
 * The long-form body under the card grid on /es/blog.
 *
 * Mirrors PAGE_CONTENT.blog, which /blog has rendered since launch. The Spanish
 * index had the grid and nothing else, so the same page carried roughly 4,500
 * fewer words in one language than the other.
 */
export const SPANISH_BLOG_INDEX_BODY: PageLongForm = {
  sections: [
    {
      heading: 'Para quién es este blog',
      paragraphs: [
        'Este blog está escrito para una persona concreta: alguien de licenciatura con cuatro a seis materias, cada una con su propio programa, su propio esquema de calificación y su propia idea de cuándo se entregan las cosas. No para un aficionado a la productividad que colecciona sistemas, sino para quien quiere que el semestre deje de producir sorpresas: el trabajo asignado en la semana dos que se entrega en la once, el parcial que resulta valer el treinta por ciento, el miércoles de diciembre con dos exámenes finales.',
        'Cada entrada toma un mecanismo concreto y lo explica de principio a fin, en el orden en que de verdad lo harías. Los métodos funcionan con una hoja de cálculo, una agenda de papel o el calendario que ya traes en el teléfono. Semora aparece al final de cada guía como la versión automática de un trabajo que podrías hacer a mano, con el plan indicado con claridad para que sepas qué partes no cuestan nada. Si una guía solo sirve después de suscribirte, está mal escrita.',
        'Hay nueve entradas, publicadas entre el 20 de julio y el 9 de agosto de 2026. Corresponden a nueve problemas, descritos abajo. Cada descripción explica el problema de fondo lo suficiente como para servir por sí sola, así que esta página vale la pena aunque no abras ninguna entrada.',
      ],
      bullets: [
        'Convertir un programa de clase en un calendario del semestre: la conversión que exige toda materia y que ninguna enseña',
        'Calcular bien una calificación ponderada, incluidas las reglas de eliminar la nota más baja y la política de redondeo',
        'Saber qué necesitas sacar en un examen final, y qué hacer cuando la respuesta pasa de 100',
        'Conseguir que un recordatorio de Canvas llegue con tiempo suficiente para actuar',
        'Planear la semana de finales según la densidad y el peso de los exámenes, no según el orden cronológico',
        'Aprovechar sesiones de estudio cronometradas en los huecos de cincuenta y noventa minutos que deja un horario real',
        'Convertir los apuntes de clase en tarjetas de estudio que valga la pena repasar, en vez de un mazo abandonado el jueves',
        'Distinguir los tres tipos de app de estudio con IA antes de pagar por la equivocada',
        'Elegir qué clase de sistema —papel, app de tareas genérica o herramienta que entiende programas— aguanta más allá de la semana diez',
      ],
    },
    {
      heading: 'Convertir un programa en un calendario del semestre',
      paragraphs: [
        'Un programa de clase está escrito como un contrato, no como un cronograma. Tiene que fijar una política de entregas tardías, una cláusula de integridad académica y un desglose de la calificación, y esas obligaciones moldean el documento mucho más que tu necesidad de saber qué se entrega el próximo martes. El resultado es que las fechas que te hacen falta quedan repartidas entre párrafos, tablas y notas al pie, en un formato completo pero inutilizable. Nadie enseña el paso de conversión, y toda materia da por hecho en silencio que ya lo hiciste.',
        'La conversión también es más trabajo de lo que parece. Una sola línea como «reporte de lectura cada viernes antes de las 11:59 p. m.» es una oración en el programa y entre doce y quince fechas distintas en el calendario. Las fechas escritas en relación con las sesiones de clase —«se entrega al inicio de la clase 14»— no significan nada hasta que mapeas el patrón de reuniones y descuentas los días feriados. Las fechas de examen suelen aparecer como «por definir» porque el calendario de finales se publica aparte, a mitad del periodo. Y las materias con muchos estudiantes reparten con frecuencia un segundo documento para el laboratorio o la monitoría, con entregas que no aparecen en el programa principal.',
        'La guía recorre todo el proceso: leer el programa completo antes de anotar nada, capturar primero la estructura que se repite (días y horas de clase, horario de atención, inicio y fin del periodo, ponderación de las categorías), después resolver cada elemento evaluado a una fecha real del calendario, y por último ponerlo en un calendario y no en una lista, porque una lista no puede mostrarte tres exámenes convergiendo en la misma semana. El último paso es el que la gente se salta: hazlo con cada materia y luego mira todas juntas. Un programa solo rara vez se ve alarmante. Cuatro apilados en los mismos siete días a veces sí.',
        'El escáner de Semora hace esa pasada de una sola vez y el primer uso está en el plan Gratis: una acción de IA para toda la vida de la cuenta, y una cuenta gratuita admite clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre. Ese tope de semestre es rígido y conviene conocerlo antes de empezar: una cuenta gratuita cubre un solo periodo, así que un segundo semestre es el punto en el que Pro pasa de opcional a necesario. Puedes importar con una foto de cámara (hasta cinco páginas por escaneo, unos diez megabytes en total), subiendo un PDF, arrastrando el archivo en la versión web o pegando texto. Extrae el nombre y la clave del curso, el profesor, los bloques de clase, el horario de atención, el inicio y el fin del semestre, la escala de letras y cada tarea, cuestionario, examen, proyecto y lectura con su fecha, su hora y su porcentaje. Una pantalla de revisión permite editar cada entrega antes de añadirla al calendario: lo que el modelo interpretó con menos seguridad aparece marcado como «Poca confianza: verifica», los elementos con fecha fuera del periodo se señalan para revisar, y lo que quedó sin fecha se queda deseleccionado en una sección de «Falta la fecha», para que no entre a tu calendario como una suposición equivocada.',
      ],
      bullets: [
        'Las líneas recurrentes se expanden: una entrega semanal son una docena o más de entradas de calendario',
        'Las fechas relativas («el viernes anterior al receso») hay que resolverlas a fechas reales sobre la marcha',
        'Los exámenes «por definir» deben quedar marcados como pendientes, no omitidos: un elemento que falta en silencio es peor',
        'Las secciones de laboratorio y monitoría suelen tener un cronograma aparte que el programa principal nunca menciona',
        'Anota las ponderaciones junto a las fechas; sin ellas, después es imposible hacer seguimiento de la calificación',
      ],
    },
    {
      heading: 'Saber cuál es realmente tu calificación',
      paragraphs: [
        'La mayoría de los estudiantes lleva en la cabeza un número que en realidad es el promedio simple de lo último que le devolvieron. La calificación ponderada existe precisamente porque ese número está mal: un cuestionario que vale cinco por ciento y un examen final que vale treinta no deberían mover tu calificación lo mismo. La fórmula no es difícil (multiplica el promedio de cada categoría por su peso, suma esos productos y divide entre los pesos que ya tienen trabajo calificado), pero dos detalles causan casi toda la confusión.',
        'El primero es el denominador. Una categoría solo cuenta cuando ya tiene una nota dentro, y por eso un examen final sin calificar que vale treinta por ciento no arrastra tu promedio actual hacia cero: simplemente todavía no forma parte del cálculo. El segundo es dónde se aplican las reglas especiales. Una política de «se elimina el cuestionario más bajo» tiene que aplicarse dentro de la categoría, antes de calcular su promedio. La guía resuelve un ejemplo donde hacerlo en el punto equivocado produce 87.3 por ciento en lugar de 88.3: las mismas notas, un punto completo de diferencia, solo por el orden.',
        'El redondeo es la otra cosa que vale la pena entender, sobre todo porque es una decisión de política y no aritmética. La convención estadounidense habitual de que 89.5 sube a 90 es eso, una convención, no una regla: hay profesores que toman el porcentaje exactamente como sale, otros que redondean después de cada tarea en lugar de una sola vez al final, y muchos programas que fijan el umbral de la letra más alta en un punto distinto de 90. Nada de eso se responde con matemáticas, y por eso conviene leer tu política de calificación concreta o preguntar por correo.',
        'La guía también separa tres números que todo el mundo llama GPA: el porcentaje ponderado de un solo curso, el GPA del semestre construido a partir de esas calificaciones y las horas crédito, y el GPA acumulado de todos los periodos. Semora calcula los dos primeros, y ambos son gratuitos. Los porcentajes por curso se actualizan conforme registras notas, y la pestaña de Cursos lleva una estimación del GPA del semestre encima de la lista, con cada calificación convertida a puntos y ponderada por las horas crédito de ese curso, y una línea debajo que te dice cuántos de tus cursos tienen ya suficiente trabajo calificado para contar. Lo que no calcula es el GPA acumulado, y la entrada lo dice de frente: ese necesita las calificaciones finales y las horas crédito de todos los periodos que ya terminaste, y eso vive en la oficina de registro académico, no en ningún programa de clase. Pro agrega una escala de puntos editable, para que la conversión de letra a puntos corresponda a tu institución y no a la tabla estándar de 4.0, además de proyección de calificaciones para calcular escenarios sobre el trabajo que falta, y Progress Insights con gráficas de tendencia, exportación CSV y vista de impresión.',
      ],
    },
    {
      heading: 'Conseguir un recordatorio con tiempo suficiente para actuar',
      paragraphs: [
        'Canvas es donde los profesores publican las tareas, y es un sistema de registro útil. No ofrece un recordatorio relativo como «avísame tres días antes». Las preferencias se configuran por categoría a nivel de cuenta, y Canvas también permite ajustes por materia que reemplazan esos valores generales. Por eso conviene revisar ambos niveles antes de concluir que las notificaciones no funcionan.',
        'Aun así, incluso una configuración perfecta tiene un techo. El Calendario global y la vista Lista del panel ya reúnen tareas y eventos de distintos cursos, así que permiten detectar una semana cargada. Lo que no hacen es ordenar esa acumulación según el peso porcentual, tu calificación actual y el esfuerzo estimado, ni enviar un aviso integrado con el número de días de anticipación que tú elijas.',
        'El impulso de poner todas las categorías en «inmediatamente» suele salir contraproducente. En cuanto el teléfono vibra por cada nota de cuestionario y cada edición del programa en seis materias, el volumen te entrena a tratar las alertas como ruido de fondo, y el único mensaje realmente urgente recibe el mismo medio segundo de descarte que todo lo demás. Lo que determina si un recordatorio sirve no es cuántos llegan, sino cuándo llegan los importantes. Con tres días por delante todavía puedes empezar la lectura, escribir una pregunta al profesor o mover algo del fin de semana. La mañana de la entrega, un recordatorio solo puede confirmar lo que ya sospechabas.',
        'Los recordatorios el mismo día de Semora están activos por defecto en todos los planes, incluido el Gratis. Pro agrega avisos de uno o tres días de anticipación y horas de silencio. El conector actual de Canvas usa un token de acceso personal y algunas instituciones desactivan o prohíben su uso con servicios externos; confirma la política de tu universidad. Si no está disponible o permitido, copia el texto de las tareas y pégalo en el escáner. La entrada cierra con una nota honesta: recordatorios más una mirada semanal al calendario, no recordatorios en lugar de esa mirada.',
      ],
      bullets: [
        'Revisa Cuenta y después Notificaciones en Canvas: cada categoría tiene su propio ajuste de entrega',
        'Fecha de entrega y Cambios en la tarea son las dos categorías que más conviene poner en «inmediatamente»',
        'Una notificación sin leer dentro de un resumen semanal equivale funcionalmente a no recibir ninguna',
        'Pasado cierto punto, más alertas compiten entre sí en vez de darte más seguridad',
        'Un recordatorio no puede avisarte de que vas quedándote atrás en una materia en general; una mirada periódica al calendario sí',
      ],
    },
    {
      heading: 'Planear una semana en la que todo cae junto',
      paragraphs: [
        'La semana de finales recompensa la planificación más que cualquier otro tramo del periodo, por una razón concreta: lo que la hace difícil es visible con meses de anticipación. Varios exámenes de mucho peso caen en una ventana corta, y los choques dentro de esa ventana se pueden conocer mucho antes de que lleguen. La forma de fallar no es la pereza: es tratar el orden cronológico como orden de urgencia y descubrir el día de dos exámenes el fin de semana anterior.',
        'El método de la guía es un inventario y después un juicio. Enumera cada examen final con su fecha, su hora y su peso en la calificación del curso. Después combina ese peso con el punto en el que realmente está tu calificación en esa materia. Un final que vale veinte por ciento de una clase donde llevas 92 necesita menos repaso defensivo que un final del mismo veinte por ciento en una clase que va en un 78 al límite, aunque el primero caiga antes en el calendario. Luego mapea los exámenes por densidad y no por fecha: un examen que parece tener una semana completa de repaso puede tener dos días en la práctica si está encajonado entre otros dos.',
        'La guía también cubre qué hacer dentro de los bloques de repaso, porque programar horas es solo la mitad del problema. Releer un capítulo mide sobre todo si el material te resulta familiar mientras lo tienes delante, que es una habilidad distinta de reconstruirlo en condiciones de examen. La recuperación activa (cerrar el libro y resolver ejercicios en frío, escribir una respuesta de memoria, explicar un concepto en voz alta) y repartir el repaso en varios días en lugar de una noche larga suelen aguantar mejor. Hay además una sección de logística: muchas instituciones publican un calendario maestro de finales que se impone sobre el programa, y las aulas y los materiales permitidos cambian más seguido de lo que los estudiantes esperan.',
        'El seguimiento de calificaciones es lo que hace posible el segundo paso, y es gratuito: necesitas saber qué materia va en un 92 cómodo y cuál en un 78 al límite antes de repartir horas con honestidad, y la estimación del GPA del semestre en la pestaña de Cursos también es gratuita, y te dice cuánto vale el periodo completo en este momento. El panel de carga académica de Pro es lo que facilita el tercer paso, mostrando las semanas pesadas y los tramos densos en exámenes de todos los cursos a la vez en lugar de dejarte cruzar la información a mano. El Plan Inteligente arma después un horario de estudio con esas fechas y lo reajusta cuando algo se mueve, y las alertas de riesgo académico señalan una calificación que baja o un trabajo faltante con pasos de recuperación bastante antes de que llegue la semana de finales.',
      ],
      bullets: [
        'El peso por sí solo no es el plan: el plan es el peso combinado con tu situación actual',
        'Busca acumulaciones: dos exámenes en un día, o tres en 48 horas, cambia todo lo que viene antes',
        'Agenda el repaso como citas concretas, no como la intención de «estudiar química»',
        'Varias sesiones cortas por examen rinden más que una noche maratónica con las mismas horas totales',
        'Deja el sueño y una actividad no académica normal como bloques fijos, no como sobras',
      ],
    },
    {
      heading: 'Estudiar en los huecos que de verdad tienes',
      paragraphs: [
        'La técnica Pomodoro —veinticinco minutos de trabajo concentrado, cinco de descanso y un descanso más largo cada cuatro ciclos— la desarrolló Francesco Cirillo a finales de los años ochenta, cuando era estudiante universitario y usaba un temporizador de cocina con forma de tomate para sacar adelante sus propias materias. Es duradera porque es simple. El problema es que casi toda explicación de la técnica asume una tarde tranquila sin nada más en la agenda, que no es como se ve un horario de clases.',
        'Un día universitario real está hecho de fragmentos: cincuenta minutos entre una clase de 10 y una de 11, noventa minutos a la hora de comer, una tarde libre. En cada uno cabe una cantidad distinta de trabajo, y lo útil es planear para el hueco que tienes y no para el que quisieras. Cincuenta minutos alcanzan para un bloque de 25 y cinco de descanso, con 20 minutos para el traslado o una tarea breve; dos bloques de 25 con un descanso necesitarían 55 minutos. Noventa minutos son dos ciclos completos con unos treinta minutos de margen. Tres horas son el conjunto tradicional de cuatro ciclos con un descanso de verdad al final. Sumado a lo largo de un martes cualquiera, eso son siete bloques de concentración sacados de huecos que ya estaban en el horario.',
        'El tamaño de la tarea es donde esto suele romperse. «Avanzar el ensayo» no es una tarea de veinticinco minutos: es un proyecto de varias sesiones disfrazado, y meterlo en un bloque produce avance difuso y ninguna sensación de qué quedó hecho. Un bloque necesita una meta concreta: redactar el segundo párrafo, resolver los ejercicios del uno al cinco, repasar las tarjetas de una materia. Los otros dos errores comunes son dejar que un descanso de cinco minutos se vuelva de quince porque costó cerrar una aplicación, y saltarse el descanso largo porque una entrega apremia, lo que cambia una pausa corta por un bajón más largo.',
        'El temporizador de concentración de Semora es una función de Pro, igual que las tarjetas de estudio y el tutor con IA que lo acompañan. Lo que el temporizador agrega frente a cualquier temporizador gratuito es contexto: la sesión se vincula a un curso o una tarea que la app ya está siguiendo, así que el tiempo de estudio queda registrado contra trabajo real y no corriendo en una app desconectada. Está al lado del Plan Inteligente y del panel de carga académica, que es la parte que de verdad responde a qué materia conviene dedicarle la sesión de hoy.',
      ],
      bullets: [
        'Hueco de 50 minutos: 25 de trabajo, 5 de descanso y 20 para una tarea breve o el traslado',
        'Hueco de 90 minutos: dos ciclos completos más unos 30 minutos de margen',
        'Bloque de 3 horas: cuatro ciclos y después un descanso real de 15 a 30 minutos',
        'Ajusta la tarea al bloque: trabajo corto y autocontenido en ventanas cortas',
        'Levántate y camina en los descansos; las pantallas cuestan mucho de soltar a tiempo',
      ],
    },
    {
      heading: 'Elegir el sistema que sostiene todo esto',
      paragraphs: [
        'Todo método para controlar fechas de entrega enfrenta tarde o temprano la misma prueba: qué pasa cuando las tareas, los exámenes y las lecturas de cuatro materias tienen que vivir en un mismo lugar al mismo tiempo. Muchos enfoques funcionan bien con una sola clase en la semana dos y se desmoronan para la semana diez. La entrada de comparación aplica esa prueba en lugar de ordenar apps según su publicidad.',
        'Las agendas de papel y las apps de tareas genéricas son la referencia honesta, y ninguna de las dos está mal. Eso sí, ninguna te quita trabajo: cada fecha sigue teniendo que transcribirse a mano desde cada programa, y cuando un profesor mueve una entrega tienes que darte cuenta y volver a copiarla tú. Ninguna tiene noción de ponderación, así que «Ensayo 2» y «Ejercicios 6» se ven idénticos aunque uno valga diez veces más, y ninguna puede avisarte de que tres materias acaban de poner examen en la misma semana.',
        'La entrada evalúa ocho apps a las que los estudiantes suelen recurrir —algunas entienden programas, otras se conectan al LMS, otras ninguna de las dos cosas, y eso mismo es parte del hallazgo— con cuatro preguntas: ¿lee un programa siquiera, o exige conexión con un LMS o registro manual?; ¿incluye seguimiento de calificaciones o es solo una lista de fechas?; ¿hay un plan gratuito permanente de verdad y no un periodo de prueba que termina en cobro?; ¿sincroniza entre el teléfono y el navegador sin configuración extra? Varias de esas herramientas resultan ser generadoras de material de estudio y no controladores de fechas, lo cual es una respuesta real a la primera pregunta y no un demérito. Cierra con una sección de cuál te conviene, incluidos los casos en que la mejor respuesta no es Semora.',
        'La entrada deja dicha una advertencia que vale la pena repetir: esas comparaciones se apoyan en las funciones publicadas por cada producto, sus páginas de precios y sus fichas de App Store, más reseñas de terceros en los casos en que una empresa no publica sus precios, y no en pruebas de uso a lo largo de un semestre completo. Todo lo que no está confirmado en el sitio de la empresa aparece señalado como reportado en lugar de afirmado como hecho, y los precios en particular cambian lo suficiente como para revisarlos directamente antes de suscribirte a nada.',
      ],
    },
    {
      heading: 'Saber qué necesitas en un examen final',
      paragraphs: [
        'La aritmética es una línea —resta lo que la parte ya calificada del curso aporta a tu objetivo y divide el resto entre el peso del final— y casi nadie se equivoca en ese paso. Los errores están todos en los datos de entrada. El porcentaje que muestra la plataforma del curso se calcula solo sobre el trabajo calificado, y que las tareas sin calificar queden excluidas o cuenten como cero depende de cómo lo haya configurado tu profesor, así que meter ese número directamente es calcular a partir de una incógnita.',
        'El caso que de verdad hace tropezar a la gente es una categoría que todavía no se ha calificado, casi siempre la participación. No es un cero, y tratarla como si lo fuera te dirá que un curso ya está perdido cuando no lo está. Lo correcto es trabajar en puntos, suponer un valor pesimista para la categoría abierta y fijarse en cuánto se mueve la respuesta: en el ejemplo resuelto de esa entrada, suponer el crédito completo de participación en vez de 85 por ciento cambia la nota requerida en casi cuatro puntos.',
        'La entrada también explica cómo el peso del final funciona como palanca en las dos direcciones. Si llegas al final con un 85, un examen que vale 20 por ciento no puede llevarte a 90 por bien que salga, mientras que uno que vale 50 por ciento sí puede: exigiendo un 95, pero exigiendo algo alcanzable en lugar de algo imposible. El mismo peso que te rescata es el que puede deshacer un buen semestre, y por eso vale la pena leerlo del programa en la semana tres y no en la quince.',
        'El seguimiento de calificaciones con categorías ponderadas está en el plan Gratis, y las ponderaciones salen del escaneo del programa junto con las fechas, así que el número en curso existe sin configuración manual. Pro agrega la escala de calificación y la proyección: calculadoras de escenarios para el trabajo que falta y una escala editable para las materias cuyos umbrales de letra no son los estándar. La entrada dice con claridad que una calculadora web suelta responde perfectamente la pregunta una vez; lo que no puede es responderla otra vez la semana siguiente, ni para cinco materias a la vez, que es la versión que decide cómo se gasta la semana de finales.',
      ],
      bullets: [
        'Nota necesaria = (objetivo − calificación actual × (1 − peso del final)) ÷ peso del final',
        'Una categoría sin calificar no es un cero: déjala fuera o supón un valor pesimista, y di cuál usaste',
        'Los puntos extra suman a lo ganado sin sumar al denominador; no son otra categoría ponderada',
        'Revisa la política de redondeo si el resultado cae a menos de un punto de un umbral de letra',
        'Calcúlalo para todas las materias, no solo para la que más angustia te da: el objetivo es reasignar horas',
      ],
    },
    {
      heading: 'Hacer tarjetas de estudio que sobrevivan al jueves',
      paragraphs: [
        'Generar un mazo a partir de los apuntes toma segundos hoy en día, y eso ha movido la parte difícil a otro lado sin que se note. Un mazo de 120 tarjetas indiferenciadas es peor que uno de 30 buenas, porque el mazo grande es el que la gente deja de abrir, y la repetición espaciada solo funciona con contacto repetido. Cada tarjeta que no evalúa nada cuesta tiempo de repaso en cada pasada.',
        'Dos hallazgos explican cómo debe ser una buena tarjeta. La práctica de recuperación significa que el acto de sacar una respuesta de la memoria es el mecanismo, así que una tarjeta que no obliga a un intento de recuperación es un apunte y no una tarjeta. El efecto de espaciamiento significa que el calendario importa tanto como el mazo. Juntos implican la regla que casi todos los mazos generados rompen: una idea por tarjeta. Una tarjeta con cuatro oraciones en el reverso no se puede calificar con honestidad —recuerdas dos a medias, redondeas hacia arriba— y el algoritmo de programación se aleja de lo que de verdad sabes.',
        'Los mazos generados además fallan de formas reconocibles, lo que los hace rápidos de arreglar en una sola pasada de edición: el reverso con párrafo, la pregunta tan específica que contiene su propia respuesta, la tarjeta de dato curioso sacada de una nota al pie, el racimo de casi duplicados y, de vez en cuando, una invención dicha con seguridad que no aparece en ningún lugar de tus apuntes. Esa última es la razón para verificar el mazo contra tus propios apuntes antes del primer repaso y no después de un mal cuestionario: una tarjeta equivocada en un calendario espaciado significa ensayar un error a propósito.',
        'La entrada también es clara sobre cuándo las tarjetas son la herramienta equivocada. Son excelentes para cualquier cosa con una respuesta correcta que quepa en una tarjeta, y malas para materias de resolución de problemas, donde lo que se evalúa es elegir y ejecutar un método y no recordar que existe uno. Las tarjetas, el temporizador de concentración y el tutor con IA son funciones de Pro. Lo que agrega la versión de Semora es de dónde sale el material: los mazos se generan del programa que ya escaneó y de los apuntes que hayas subido, y pueden acotarse a un examen o cuestionario concreto tomado de tus entregas registradas, para que un repaso de parcial no llegue diluido con material del final.',
      ],
      bullets: [
        'Una idea por tarjeta: es lo que hace que la autocalificación, y por lo tanto el calendario, signifiquen algo',
        'Acota un mazo a una sola evaluación, no a un curso entero',
        'Cuenta con borrar cerca de un tercio de lo que devuelve un generador',
        'Verifica las tarjetas contra tus propios apuntes antes del primer repaso, no después',
        'Un día sin repasar sale caro: todo lo programado cae encima de la cola del día siguiente',
      ],
    },
    {
      heading: 'Distinguir las apps de estudio con IA antes de pagar una',
      paragraphs: [
        '«App de estudio con IA» describe por lo menos tres productos distintos, y casi toda la decepción en esta categoría es un desajuste y no un mal producto. Las apps centradas en el programa leen los documentos de tus materias y arman un semestre de fechas. Las centradas en el material convierten un PDF o la grabación de una clase en tarjetas, apuntes y cuestionarios. Las centradas en la agenda organizan el tiempo y las tareas que tú registras o importas. Solo la primera responde qué se entrega y cuánto vale; solo la segunda te ayuda a aprender un capítulo.',
        'Las categorías fallan en direcciones opuestas, que es lo que hace práctica la distinción en vez de académica. Una app centrada en el material te generará con gusto sesenta tarjetas de una materia en la que estás a punto de perder una entrega. Una agenda te recordará una entrega que no tiene forma de ayudarte a cumplir. Saber cuál de las dos carencias tienes es la mayor parte de la decisión, y por eso la respuesta honesta para muchos estudiantes es una app de cada categoría en lugar de un solo ganador.',
        'La palabra «IA» también hace tres trabajos distintos a lo largo del grupo. En las apps centradas en el programa es extracción: convertir un documento sin estructura en fechas y ponderaciones, el trabajo con más probabilidad de salir mal en silencio, y por eso un paso de revisión antes de guardar importa más que el modelo que hay detrás. En las centradas en el material es generación, donde los fallos son más visibles pero más frecuentes. En las agendas es estimación, lo más difícil de hacer bien de los tres y lo más fácil de comprobar tú mismo en una semana.',
        'La entrada compara siete apps por aquello alrededor de lo que están construidas, si convierten un programa en fechas, si llevan una calificación y cuánto cuestan, con una segunda tabla sobre lo que incluye realmente cada plan gratuito. Vale la pena adelantar un patrón: los planes gratuitos de la categoría centrada en el material suelen ser demostraciones dimensionadas para enseñarte el producto, mientras que los de las categorías centradas en el programa y en la agenda son utilizables, porque generar respuestas de tutor le cuesta dinero al proveedor cada vez que se usan y guardar una fecha no.',
      ],
      bullets: [
        'Centradas en el programa: el documento del curso es la fuente de verdad (fechas, ponderaciones, horarios)',
        'Centradas en el material: tus archivos subidos son la fuente de verdad (tarjetas, apuntes, cuestionarios, tutoría)',
        'Centradas en la agenda: lo que escribes o importas es la fuente de verdad (planificación y recordatorios)',
        'Nombra la falla que te sigue pasando y elige de la categoría que la resuelve',
        'Los precios de la competencia se mueven, y varios proveedores no los publican: confírmalos antes de suscribirte',
      ],
    },
    {
      heading: 'Cómo están escritas estas guías',
      paragraphs: [
        'En este blog no aparece ningún número inventado. Semora se lanzó hace poco y no tiene un historial de calificaciones significativo, así que aquí no vas a encontrar cifras de descargas, totales de usuarios, valoraciones con estrellas, testimonios ni nombres de universidades, ni presentados de forma vaga ni como estimaciones. Cuando una entrada se apoya en un principio general sobre el aprendizaje, como que el repaso espaciado rinde más que una sola noche de atracón, lo dice como hallazgo general y no lo disfraza de estudio que nadie puede comprobar.',
        'Las menciones al producto llevan indicado el plan en el punto en que aparecen, porque una guía que te empuja en silencio hacia un muro de pago no es una guía. Gratis significa gratis: una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, seguimiento completo de entregas y tareas, seguimiento de calificaciones con promedios ponderados, una estimación del GPA del semestre ponderada por horas crédito, recordatorios el mismo día y la posibilidad de unirte a un Course Space al que te invite un compañero. Los dos límites rígidos son esa acción única, que no se renueva, y los semestres: una cuenta gratuita cubre un solo semestre, así que un segundo periodo es donde Pro deja de ser opcional. Pro cuesta $3.99 al mes o $19.99 al año, lo que sale alrededor de $1.67 mensuales en el plan anual, se puede comprar con tarjeta en la web o dentro de la app de iOS, y en ambos casos se aplica a toda tu cuenta; solo se paga una vez. Ser anfitrión de tu propio Course Space es de Pro; unirte a uno que alguien comparta contigo es gratis y sigue siéndolo.',
        'También conviene ser claro sobre lo que este blog no cubre. No calcula el GPA acumulado, porque Semora tampoco lo hace: calificaciones ponderadas por curso y una estimación del GPA del semestre, sí; un número de todo el expediente, no. No escribe sobre funciones que no se han lanzado, y por eso aquí no vas a encontrar nada sobre sincronización con Google Classroom o Google Calendar. Y Semora es una app universal de iOS para iPhone y iPad más una app web en una sola cuenta, sincronizadas casi en tiempo real: no hay app de Android, así que quien use Android trabaja en el navegador, donde la sincronización con el calendario del dispositivo no funciona y la exportación .ics es la forma de llevar las fechas a un calendario externo.',
      ],
    },
  ],
  faq: [
    {
      question: '¿Necesito Semora para seguir estas guías?',
      answer: 'No. Cada entrada está escrita para que el método funcione con una hoja de cálculo, una agenda de papel o el calendario que ya traes en el teléfono: primero van los pasos y al final el producto. Semora aparece al cierre de cada guía como la versión automática de un trabajo que podrías hacer a mano, con el plan indicado para que sepas qué no cuesta nada. Una guía que solo sirve después de suscribirte es una página de ventas, no una guía.',
    },
    {
      question: '¿Cuál entrada debería leer primero?',
      answer: 'Depende de en qué punto del periodo estés. En la primera semana, empieza por convertir el programa en un calendario del semestre, porque todo lo demás asume que esas fechas ya existen en algún lado. Cuando regrese el primer trabajo calificado, la guía de calificación ponderada es la que importa. Lee la entrada de recordatorios de Canvas en cuanto una fecha te tome por sorpresa. Guarda la guía de finales para más o menos un mes antes, mientras todavía hay tiempo de adelantar el repaso.',
    },
    {
      question: '¿La importación desde Canvas está incluida en el plan Gratis?',
      answer: 'No. Conectar Canvas es gratis; Blackboard y Moodle forman parte de Pro, a $3.99 al mes o $19.99 al año, y lo aplica el servidor en lugar de que la app se limite a ocultar un botón. De todos modos la ruta del plan Gratis es real, y la entrada sobre Canvas la explica: copia tu lista de tareas como texto y pégala directamente en el escáner de programas, que acepta texto pegado en la web desde veinte hasta sesenta mil caracteres.',
    },
    {
      question: '¿Semora calcula mi GPA acumulado?',
      answer: 'No, y la entrada sobre GPA ponderado lo dice de frente en lugar de esconderlo. Lo que Semora sí calcula, ambos en el plan Gratis, es el porcentaje ponderado por curso (tu calificación actual en una materia, a partir de las notas y ponderaciones que registras y contando solo las categorías que ya tienen trabajo calificado) y una estimación del GPA del semestre en la pestaña de Cursos, que convierte cada una de esas calificaciones a puntos y la pondera por las horas crédito del curso. El GPA acumulado es el que queda fuera de alcance: necesita las calificaciones finales y las horas crédito de todos los periodos de tu expediente, y eso vive en la oficina de registro académico y no en ningún programa de clase. Pro agrega una escala de puntos editable si la conversión de letra a puntos de tu institución no es la estándar.',
    },
    {
      question: '¿Qué puedo hacer realmente sin pagar?',
      answer: 'Una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento, la que necesites primero—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, seguimiento completo de entregas y tareas, seguimiento de calificaciones con promedios ponderados, una estimación del GPA del semestre, recordatorios el mismo día y unirte a un Course Space al que te invite un compañero. Sin tarjeta de crédito y sin límite de tiempo sobre el plan en sí: el límite es de alcance y no de reloj, con dos excepciones que conviene saber desde el principio, y son que esa acción de IA no se renueva y que una cuenta gratuita cubre un semestre, así que empezar un segundo periodo implica Pro. Pro quita el límite de acciones de IA (sigue habiendo un techo de uso razonable de veinte escaneos al día) y agrega cursos y semestres ilimitados, importación desde el LMS, ser anfitrión de tu propio Course Space, el Plan Inteligente, el panel de carga académica, las tarjetas de estudio, el temporizador de concentración, el tutor con IA y la sincronización de calendario con exportación .ics.',
    },
    {
      question: '¿Estas entradas citan investigación o estadísticas de usuarios?',
      answer: 'Estadísticas de usuarios, ninguna, porque no existen para reportar e inventarlas sería peor que no decir nada: aquí no vas a encontrar cifras de descargas, valoraciones ni testimonios. Cuando una entrada se apoya en un principio general sobre el aprendizaje, como que el repaso espaciado rinde más que una sola noche de atracón, se presenta como hallazgo general. Los datos de la competencia salen del sitio, la página de precios o la ficha de App Store de cada empresa, más reseñas de terceros cuando la empresa no publica sus precios, y todo lo que la empresa no confirma queda señalado como reportado.',
    },
  ],
};

/** Resumen breve para que el índice oriente; las guías contienen el detalle. */
/**
 * Cuerpo largo de la portada en español.
 *
 * Espejo de PAGE_CONTENT.home en lib/page-content.ts. Ambas portadas eran las
 * páginas más cortas de sus respectivos idiomas pese a ser la URL de mayor
 * prioridad del sitio: las secciones diseñadas de arriba se quedan como están
 * y la profundidad va debajo, igual que en las páginas índice.
 */
export const SPANISH_HOME_SUMMARY: PageLongForm = {
  sections: [
    {
      heading: 'La primera semana del semestre llega en forma de cuatro PDF',
      paragraphs: [
        'Cada profesor redacta el programa a su manera. Uno te da una tabla de fechas impecable. Otro entierra el parcial en un párrafo de la página seis, entre la política de asistencia y el apartado de integridad académica. Un tercero reparte el curso entero por doce páginas de calendario. Los cuatro contienen lo mismo —tu semestre completo— y ninguno está en un formato con el que puedas actuar.',
        'Así que los documentos se quedan en el archivo adjunto, las fechas viven en tu cabeza, y la primera sorpresa de verdad llega en la semana seis, cuando dos exámenes caen en las mismas 48 horas y un proyecto que habías olvidado resulta valer la cuarta parte de la nota. No es un problema de disciplina: la información estaba repartida entre cuatro documentos que nadie tuvo tiempo de transcribir.',
        'Semora empieza justo en ese momento. En lugar de darte una agenda vacía para que la rellenes, lee el documento que ya contiene tu curso y lo convierte en un semestre que puedes revisar en unos minutos. Lo que sale no es un resumen: son cursos reales, entregas reales, ponderaciones reales y horarios reales con los que el resto de la app puede hacer cuentas.',

      ],
      bullets: [
        'Cuatro programas son casi una hora de mecanografía, y por eso la mayoría de las agendas se abandonan en la semana seis',
        'El programa es donde viven las ponderaciones, las fechas de examen, las horas de atención y la escala de notas, y mucho de eso nunca llega al campus virtual',
        'Semora lee el documento en lugar de pedirte que lo vuelvas a escribir',

      ],
    },
    {
      heading: 'Qué ocurre exactamente cuando escaneas un programa',
      paragraphs: [
        'En iPhone o iPad puedes fotografiar hasta cinco páginas en un escaneo, subir un PDF sin tope de páginas, seleccionar hasta cinco imágenes de tu fototeca o sacar un archivo de la app Archivos. En la web puedes arrastrar un archivo sobre el marco de escaneo, o pegar texto de entre 20 y 60.000 caracteres, que es la vía más rápida y precisa cuando estás en un portátil y puedes seleccionar el texto directamente.',
        'Entre diez y treinta segundos después tienes un curso con su profesor, un horario de clases con días y aulas, los cortes de la escala de notas que imprimió tu profesor, y una lista de cada tarea, cuestionario, examen, proyecto y lectura que haya podido encontrar, cada uno con su fecha, su hora si estaba indicada, y su peso sobre la nota final.',
        'Y ahí se detiene. El curso, sus horarios y su escala quedan archivados, pero no se guarda ni una sola entrega hasta que lees la lista y la apruebas. Lo que el escáner no tuvo claro se marca para que lo verifiques, las fechas que caen fuera del semestre se señalan, y los elementos que llegaron sin fecha se separan en lugar de asignarles una en silencio. Esa pantalla de revisión es el punto: una IA que archiva fechas en tu nombre sin enseñártelas es un problema peor que el tecleo que sustituye.',

      ],
      bullets: [
        'Foto (hasta 5 páginas, que cuentan como un escaneo), PDF, fototeca, Archivos, arrastrar y soltar, o texto pegado',
        'Extrae curso, profesor, horarios, horas de atención, fechas del semestre, escala de notas y cada elemento con fecha y ponderación',
        'Lo de menor confianza se marca, las fechas fuera de rango se señalan y lo que llega sin fecha se retiene',
        'Nada llega a tu calendario hasta que lo apruebas',

      ],
    },
    {
      heading: 'Qué cubre el plan Gratis y dónde están exactamente los límites',
      paragraphs: [
        'El plan Gratis no es una prueba que caduca. Es una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre, y un semestre en total. Dentro de esos límites tienes toda la capa de organización: seguimiento completo de tareas y fechas, calificaciones con medias ponderadas, recordatorios el mismo día, y la posibilidad de unirte a un Espacio de curso al que te invite un compañero.',
        'Los dos límites que conviene entender antes de empezar son el de cursos y el de semestres, y funcionan distinto. El curso que añades a mano es un techo sobre cuánto puedes escribir tú dentro de un mismo periodo; lo que llega de Canvas no cuenta y no tiene tope. Un semestre es una línea más dura: una cuenta gratuita no puede iniciar un segundo periodo, así que el tope no se renueva solo en enero. Pro elimina ambos, junto con el límite de una sola acción de IA.',
        'Pro cuesta 3,99 USD al mes o 19,99 USD al año, que sale a unos 1,67 USD al mes en el plan anual. Se compra con tarjeta en la web, mediante Stripe, o dentro de la app de iOS a través de la App Store, y se aplica a toda tu cuenta pagues donde pagues: solo se paga una vez, no hay una versión de Semora que tengas que pagar dos veces.',

      ],
      bullets: [
        'Gratis: 1 acción de IA para toda la vida de la cuenta, hasta clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un semestre, un semestre en total',
        'Gratis incluye fechas, tareas, calificaciones ponderadas y recordatorios el mismo día, completos',
        'Pro (3,99 USD al mes o 19,99 USD al año) elimina los tres topes y añade las herramientas de planificación y estudio',
        'Pro se compra con tarjeta en la web o en la app, y se aplica a toda la cuenta',

      ],
    },
    {
      heading: 'Las piezas están conectadas, y ese es todo el sentido',
      paragraphs: [
        'El escaneo no es el producto. Lo que hace que valga la pena es que otras cuatro cosas leen de él después, sin que introduzcas nada dos veces.',
        'El seguimiento de calificaciones usa las ponderaciones que el escaneo sacó de tu programa, y calcula tu media sobre el trabajo que de verdad se ha corregido: la suma ponderada de tus notas dividida entre el peso que has cursado, no entre el peso total del semestre. Esa única decisión es lo que mantiene el número honesto en octubre, cuando un examen final sin calificar que vale el 30 % lo arrastraría hacia cero.',
        'La vista de carga académica puntúa cada tarea con fecha como su ponderación multiplicada por un factor de esfuerzo —un examen cuenta el triple, un proyecto 2,5, un cuestionario 1,5, una tarea 1,2 y una lectura 1— así que una semana con dos exámenes se lee como pesada aunque tu profesor no imprimiera ningún porcentaje al lado. El Plan Inteligente toma esas mismas tareas y reparte sesiones de estudio a lo largo de los próximos catorce días, esquivando las clases que el escaneo ya conoce. Y el Tutor con IA responde desde el programa real de ese curso, tus entregas registradas y los apuntes que hayas subido, en lugar de suponer.',
        'La consecuencia práctica conviene decirla claro: cada función de planificación y de estudio vale exactamente lo que tengas metido del semestre. Dos cursos a medias no le dan al planificador casi nada sobre lo que razonar. Cuatro cursos escaneados, con sus ponderaciones reales y algunas notas puestas, lo afilan todo en una semana.',

      ],
      bullets: [
        'Las calificaciones leen las ponderaciones que extrajo el escaneo',
        'La carga académica señala las semanas cargadas de exámenes antes de que lleguen',
        'El Plan Inteligente programa alrededor de los horarios ya registrados',
        'El Tutor responde desde tu programa, tus fechas y tus apuntes, y nunca inventa una fecha',

      ],
    },
    {
      heading: 'No estás obligado a escanear nada',
      paragraphs: [
        'Conviene decirlo, porque el nombre sugiere lo contrario. Puedes crear un curso a mano y añadir tú las entregas, las subtareas y las notas: el cálculo de calificaciones, el Calendario, la vista Hoy y los recordatorios se comportan igual con datos escritos a mano. Nada de lo que viene después comprueba si un curso llegó por escaneo.',
        'Lo mismo vale para Canvas. Semora funciona solo con tu programa, y la importación desde Blackboard y Moodle es una función Pro, y Canvas es gratis opcional, no un requisito. El conector actual de Canvas usa un token de acceso personal que generas tú, y algunas instituciones desactivan su creación o prohíben su uso por terceros: confirma la política de tu centro, y si no está permitido, escanear el programa o pegar la lista de tareas cubre el mismo trabajo en el plan Gratis.',
        'Reescanear también se comporta a propósito. Escanear un programa revisado sobre un curso que ya tienes incorpora las entregas nuevas, pero no reescribe un horario que ya corregiste: las filas de clases y de horas de atención solo se escriben al crear el curso, y la escala de calificación se sustituye únicamente si la dejaste como estaba por defecto. Es un intercambio deliberado: la app prefiere conservar tus correcciones antes que sobrescribirlas con una suposición nueva.',

      ],
      bullets: [
        'Crear cursos a mano está plenamente admitido y se comporta igual en todo lo demás',
        'La importación desde Blackboard y Moodle es opcional y de Pro, y la de Canvas es gratis, y depende de la política de tu institución',
        'Un reescaneo añade entregas nuevas sin sobrescribir un horario que ya arreglaste',

      ],
    },
    {
      heading: 'Para quién encaja, y quién debería usar otra cosa',
      paragraphs: [
        'Semora encaja bien si tus fechas llegan como documentos y no como una lista ordenada, si alguna vez has vuelto a montar la misma hoja de cálculo de notas en octubre, o si la plataforma de tu universidad no muestra una nota ponderada en la que confíes de verdad. Encaja bien si lo que te falla no es olvidar una entrega, sino descubrir tres a la vez.',
        'Encaja peor en algunos casos, y vale la pena decirlo. Si todos tus cursos se gestionan por completo en el campus virtual y tus profesores lo publican todo allí, puede que con la sincronización te baste. Si quieres entregar trabajos o escribir a un profesor, eso sigue ocurriendo en Canvas: Semora es una capa por encima, no un sustituto. Y no es un expediente oficial: el número que muestra es tu estimación, construida con lo que introdujiste, y el número de tu profesor es el que va al historial.',
        'La forma realista de empezar es con un programa, no con cuatro. Escanea el curso cuyas fechas tengas menos claras, mira qué salió de la página, y decide a partir de ahí si el resto del periodo merece veinte minutos más.',

      ],
      bullets: [
        'Mejor cuando las fechas llegan en programas y tus notas son de verdad ponderadas',
        'Menos útil si tu campus virtual ya publica una nota ponderada que consultas y en la que confías',
        'No sirve para entregar trabajos ni es un expediente oficial',
        'Empieza con un curso, no con el semestre entero',

      ],
    },
  ],
  faq: [
    {
      question: '¿Cuánto se tarda en montar un semestre completo?',
      answer:
        'Unos veinte minutos para cuatro cursos, y la mayor parte de ese tiempo eres tú leyendo la pantalla de revisión, no esperando a la app. Cada escaneo tarda entre diez y treinta segundos; revisar es la parte que pide atención de verdad, y es la que no conviene apurar.',
    },
    {
      question: '¿Un escaneo de cinco páginas gasta más de una acción de IA?',
      answer:
        'No. Un escaneo con foto de hasta cinco páginas cuenta como uno solo, así que un programa entero cabe dentro de una sola acción. El plan Gratis da una acción de IA completada para toda la vida de la cuenta, y no se renueva cada mes: gástala en el programa que peor tengas controlado.',
    },
    {
      question: '¿Qué pasa con mis datos si dejo de pagar Pro?',
      answer:
        'Tu cuenta y tus datos académicos se mantienen intactos y conservas todo lo del plan Gratis. La sincronización con el calendario del dispositivo se pausa en lugar de borrar los eventos que ya creó, y los Espacios de curso que alojas no desaparecen: las fechas que ya publicaste siguen publicadas.',
    },
    {
      question: '¿Se usa mi programa para entrenar un modelo de IA?',
      answer:
        'Los archivos que subes van a un almacenamiento privado, archivados bajo tu propio identificador de usuario, y solo se leen en el servidor cuando un escaneo, una generación de tarjetas o una consulta al Tutor los necesita. La política de privacidad es la declaración autoritativa sobre el tratamiento de datos, y está enlazada en el pie de cada página.',
    },
  ],
};

export const SPANISH_BLOG_INDEX_SUMMARY: PageLongForm = {
  sections: [
    {
      heading: 'Guías prácticas para un semestre manejable',
      paragraphs: [
        'El blog de Semora está pensado para resolver problemas concretos: fechas enterradas en un programa, una calificación ponderada que no coincide con el promedio simple, una semana de finales demasiado cargada o apuntes que nunca llegan a convertirse en práctica. Cada guía funciona por sí sola, aunque uses una hoja de cálculo, una agenda de papel u otra app.',
        'Empieza por lo que hoy te está costando tiempo. La guía del programa convierte un documento del curso en un calendario revisado. Las de calificaciones y examen final resuelven las fórmulas paso a paso. La guía de Canvas explica qué vistas ya ofrece la plataforma y cuándo sirve una capa de recordatorios con anticipación. Las de Pomodoro y finales convierten un horario real en sesiones que sí caben.',
      ],
      bullets: [
        'Preparar el semestre: fechas recurrentes, ponderaciones y revisión del calendario',
        'Tomar decisiones con notas: promedio ponderado y objetivo para el examen final',
        'Planear entregas: vistas de todos los cursos, recordatorios y semanas saturadas',
        'Estudiar: sesiones de concentración, recuperación activa, tarjetas y repaso espaciado',
        'Comparar herramientas: qué resuelve cada categoría, qué no resuelve y qué conviene verificar',
      ],
    },
    {
      heading: 'La extensión útil depende de la pregunta',
      paragraphs: [
        'Las guías son detalladas porque una fórmula necesita ejemplos, una comparación necesita criterios y límites, y un plan necesita un horario que sume correctamente. La longitud solo ayuda mientras cumple una de esas funciones. Repetir resúmenes o añadir texto de relleno no vuelve una página más fiable.',
        'Si buscas una respuesta rápida, lee el resumen inicial y la tabla o el ejemplo resuelto. Si necesitas aplicar el método, continúa con las comprobaciones y los errores comunes. Las tarjetas de artículos relacionados al final de cada entrada sirven para elegir el siguiente paso, no para publicar otra versión de la misma palabra clave.',
      ],
    },
    {
      heading: 'Cómo tratamos comparaciones y afirmaciones de producto',
      paragraphs: [
        'Semora publica este sitio y aparece en algunas comparaciones, por lo que ese conflicto debe quedar visible. Las comparaciones son revisiones de escritorio basadas en páginas de producto, precios, documentación y fichas de tienda consultadas en la fecha indicada. No implican pruebas prácticas de cada app salvo que el artículo lo diga expresamente. Los precios y las integraciones cambian; confirma la documentación actual del proveedor antes de pagar.',
        'Los consejos de aprendizaje se presentan como métodos para probar, no como promesas universales. También indicamos los límites reales del producto: la cuenta gratuita cubre una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano dentro de un solo semestre, y un semestre total. Cada entrega extraída se puede corregir y debe revisarse antes de añadirla al calendario.',
      ],
    },
  ],
  faq: [
    {
      question: '¿Quién escribe estas entradas?',
      answer: 'Las publica Semora y la firma visible enlaza a la página Acerca de. Las comparaciones también indican que Semora es el editor y, cuando corresponde, uno de los productos incluidos.',
    },
    {
      question: '¿Las comparaciones son reseñas prácticas?',
      answer: 'Son revisiones de escritorio de páginas de producto, documentación, precios y fichas de tienda, salvo que una entrada indique expresamente otra metodología. Verifica los datos actuales con el proveedor.',
    },
    {
      question: '¿Qué guía conviene leer primero?',
      answer: 'Empieza por el problema actual: programa a calendario para fechas perdidas, calificación ponderada para saber cómo vas, fórmula del final para una nota objetivo, Canvas para avisos tardíos o el plan de finales para una ventana de exámenes saturada.',
    },
    {
      question: '¿Necesito Semora para aplicar los consejos?',
      answer: 'No. Los métodos funcionan con una hoja de cálculo, un calendario o una agenda. Cuando Semora automatiza un paso, la entrada identifica el plan correspondiente y una alternativa manual cuando existe.',
    },
  ],
};

const BLOG_PAGES: SpanishPageConfig[] = [
  page(SPANISH_BLOG_POSTS[0].path, SPANISH_BLOG_POSTS[0].englishPath, 'standard', {
    metaTitle: 'Convertir un programa en calendario del semestre',
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
          'El plan Gratis incluye 1 acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, con seguimiento completo de entregas y calificaciones, además de recordatorios el mismo día. La sincronización con el calendario del dispositivo y la exportación .ics forman parte de Pro, que cuesta $3.99 al mes o $19.99 al año y se compra con tarjeta en la web o dentro de la app.',
          'La importación desde Canvas es gratis y el conector actual usa un token de acceso personal. Algunas instituciones desactivan o prohíben usar esos tokens con servicios externos; confirma la política de tu universidad. Si no está disponible o permitido, puedes escanear el programa o pegar la lista de tareas de Canvas; así sigues reuniendo las fechas y el contexto del programa en Semora.',
        ],
      },
    ],
    faq: [
      { question: '¿Cuánto me va a tomar pasar un programa al calendario a mano?', answer: 'Depende mucho del documento. Un programa con una tabla limpia de fechas se pasa rápido; uno con entregas recurrentes, laboratorio aparte y fechas relativas a la sesión de clase toma bastante más, porque cada línea hay que resolverla con el calendario académico en la mano antes de poder anotarla. De todos modos, la primera pasada casi nunca es lo que falla: lo que falla es el mantenimiento a mitad de semestre, cuando el documento ya está cerrado y las fechas empiezan a moverse.' },
      { question: '¿Qué hago con una fecha “por definir”?', answer: 'Crea el elemento igual, sin inventarle fecha, y márcalo como pendiente para revisarlo más adelante. Un examen sin fecha sigue necesitando seguimiento, y es preferible ver un pendiente en la lista a que el examen simplemente no exista en tu calendario. Ponerle una fecha tentativa es peor que dejarlo pendiente: en cuanto la olvidas, la tentativa se comporta como si fuera oficial.' },
      { question: '¿Debo poner las lecturas en el calendario?', answer: 'Sí, cuando tienen fecha de discusión, prueba o entrega asociada. Las lecturas abiertas, sin fecha fija, funcionan mejor como tareas sin hora exacta, para que no compitan visualmente con las entregas que sí tienen consecuencias en la calificación.' },
      { question: 'Si el programa y la plataforma del curso no coinciden, ¿cuál manda?', answer: 'Manda la fuente oficial más reciente, que en la práctica suele ser el anuncio o la plataforma, no el PDF de la primera semana. Cuando cambies una fecha, deja anotado de dónde salió el cambio: así no terminas con dos versiones de la misma tarea sin saber cuál es la buena.' },
      { question: '¿Sirve escanear el programa si mi materia ya está conectada a Canvas?', answer: 'Sí, porque no traen lo mismo. Canvas trae las tareas y sus fechas; el horario de atención, los horarios de clase, la escala de calificación y las ponderaciones normalmente solo están en el programa. Con las dos fuentes juntas tienes las fechas actualizadas y el contexto que explica cuánto pesa cada una.' },
      { question: '¿Necesito Pro para organizar el semestre así?', answer: 'No. Con el plan Gratis puedes escanear un programa —esa es la acción de IA que trae la cuenta, una para toda su vida— y llevar clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano en un semestre total, con seguimiento de entregas y calificaciones, además de recordatorios el mismo día. Una cuenta gratuita no puede iniciar un segundo periodo. Pro suma la sincronización con el calendario del dispositivo y la exportación .ics, y cuesta $3.99 al mes o $19.99 al año, con tarjeta en la web o dentro de la app.' },
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
          'El seguimiento de calificaciones viene en el plan Gratis, que incluye una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total.',
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
      { question: '¿Necesito Pro para llevar mis calificaciones?', answer: 'No. El seguimiento de calificaciones y la estimación del GPA del semestre están incluidos en el plan Gratis, junto con una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total. Pro, a $3.99 al mes o $19.99 al año, agrega los pronósticos, el simulador de escenarios, las tendencias de progreso, la exportación CSV, la vista para imprimir y las alertas de riesgo académico.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[2].path, SPANISH_BLOG_POSTS[2].englishPath, 'standard', {
    metaTitle: 'Apps para controlar entregas universitarias (2026)',
    metaDescription: SPANISH_BLOG_POSTS[2].description,
    h1: SPANISH_BLOG_POSTS[2].title,
    lede: 'Cualquier método aguanta la segunda semana; la pregunta de fondo es quién copia las fechas del programa al calendario cada vez que un profesor mueve algo.',
    intro: [
      'Todo sistema para controlar entregas termina en la misma prueba: qué pasa cuando las tareas, los exámenes y las lecturas de cuatro cursos tienen que convivir en el mismo lugar. Un método que funciona con una sola materia en la segunda semana suele venirse abajo en la semana diez, cuando los cuestionarios, las guías de ejercicios, las entregas parciales de un proyecto y un par de parciales compiten por los mismos días.',
      'La diferencia entre una herramienta y otra casi nunca está en la cantidad de funciones. Está en quién convierte el programa de cada materia en fechas concretas: tú, línea por línea, cada vez que algo cambia, o la app. Ese reparto del esfuerzo decide si el sistema sigue vivo en noviembre.',
      'A continuación repasamos las opciones más comunes, las apps que atacan este problema, las cuatro preguntas con las que las medimos y una guía rápida para tu caso.',
      'Semora publica esta comparación y es uno de los productos incluidos. Es una revisión de escritorio basada en páginas de producto, precios, documentación y fichas de tienda consultadas en agosto de 2026; no afirmamos haber probado personalmente cada app. Confirma los datos actuales con el proveedor antes de elegir.',
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
          'El plan Gratis incluye una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total. No caduca por tiempo, pero esa acción no se renueva y una cuenta gratuita no puede iniciar un segundo periodo. La sincronización con tu calendario mediante exportación .ics es una función de Pro.',
          'Pro añade la importación de tareas desde Canvas, Blackboard y Moodle. El conector actual de Canvas usa un token personal y algunas instituciones desactivan o prohíben su uso con servicios externos; confirma la política de tu universidad. Si no está disponible o permitido, puedes escanear el programa o pegar la lista de tareas.',
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
          'Mindgrasp toma un PDF, DOCX, PowerPoint, audio, video de YouTube o artículo web —o graba una clase en vivo— y devuelve apuntes con IA, un resumen, tarjetas de estudio, un cuestionario y un chat de tutor sobre ese contenido. El nivel Scholar o Premium añade un “experto en matemáticas”. Declara compatibilidad con Canvas, Blackboard y Panopto, pero para importar archivos, no para leer fechas. Con la opción anual activa, su selector oficial mostraba Basic a $5.99 al mes facturados como $71.88 al año, Scholar a $8.99 al mes facturados como $107.88 al año y Premium a $10.99 al mes facturados como $131.88 al año; confirma la oferta y el precio mensual en la pantalla de pago.',
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
          'Cuando un dato no está confirmado por la propia empresa lo señalamos: aplica al precio de StudyFetch y a las cifras de usuarios de Studley AI. Las páginas oficiales de Shovel también muestran precios incompatibles entre sí. Confirma el importe y la frecuencia de cobro en la pantalla de pago antes de suscribirte.',
        ],
      },
      {
        heading: 'Dónde encaja Semora',
        paragraphs: [
          'El plan Gratis de Semora incluye una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, además de seguimiento completo de fechas de entrega y calificaciones y recordatorios el mismo día. Es la combinación que buscábamos al empezar esta lista: el programa convertido en calendario sin trabajo manual y las calificaciones en el mismo lugar.',
          'Semora Pro cuesta $3.99 al mes o $19.99 al año, se compra con tarjeta en la web o dentro de la app, y quita el límite de cursos y de semestres, junto con el de acciones de IA. Añade el Plan Inteligente, el panel de carga académica, la escala de calificaciones con pronóstico, la sincronización de calendario con exportación .ics, las tarjetas de estudio, el temporizador de concentración, el Tutor con IA, las alertas de riesgo académico, las estadísticas de progreso y las funciones de compartir y rachas.',
          'Funciona en iPhone y en la web con una sola cuenta: un cambio hecho en el teléfono aparece en el navegador casi de inmediato. Si vienes de una hoja de cálculo, el primer escaneo muestra la diferencia: el programa entra completo, con ponderaciones y horarios.',
        ],
      },
    ],
    sourceNote: 'Estos enlaces son las fuentes primarias del contraste; las cifras que el artículo marca como «reportadas» provienen de cobertura externa y siguen sin verificarse.',
    sources: [
      { label: 'Funciones de Semora', href: '/es/funciones' },
      { label: 'Precios de Semora', href: '/es/precios' },
      { label: 'DormWay para estudiantes', href: 'https://dormway.app/for-students' },
      { label: 'Precios de DormWay', href: 'https://dormway.app/pricing' },
      { label: 'Centro de ayuda de Shovel', href: 'https://help.shovelapp.io/en' },
      { label: 'Precios de Shovel', href: 'https://shovelapp.io/pricing/' },
      { label: 'Página de compra de Shovel', href: 'https://shovelapp.io/buy/' },
      { label: 'Sitio oficial de StudyFetch', href: 'https://www.studyfetch.com/' },
      { label: 'StudyFetch en App Store', href: 'https://apps.apple.com/us/app/studyfetch-make-learning-easy/id6663574866' },
      { label: 'Sitio oficial de Mindgrasp', href: 'https://www.mindgrasp.ai/' },
      { label: 'Selector de planes de Mindgrasp', href: 'https://app.mindgrasp.ai/pick-plan' },
      { label: 'Sitio oficial de Studley', href: 'https://www.studley.ai/' },
      { label: 'Studley en Google Play', href: 'https://play.google.com/store/apps/details?id=ai.studley.app' },
      { label: 'Precios de Taskade', href: 'https://www.taskade.com/pricing' },
      { label: 'myHomework en App Store', href: 'https://apps.apple.com/us/app/myhomework-student-planner/id303490844' },
    ],
    faq: [
      { question: '¿Cuál es la mejor app si mi universidad no usa Canvas?', answer: 'Si tu institución usa Blackboard o Moodle, DormWay sincroniza esas dos además de Canvas sin costo. Si no permite ninguna conexión externa —algo común en América Latina—, queda el escaneo del programa: la información existe en el PDF aunque no haya API que la entregue.' },
      { question: '¿Vale la pena pagar por un planificador si ya uso Google Calendar?', answer: 'Depende de quién llene el calendario. Google Calendar guarda perfectamente una fecha, pero alguien tiene que escribirla, y no sabe que ese examen pesa mucho más que una tarea cualquiera. Si tu problema es la transcripción y el seguimiento de los cambios, ahí una herramienta que lee el programa cambia las cosas.' },
      { question: '¿Un escaneo automático se equivoca con las fechas?', answer: 'Puede equivocarse, sobre todo con tablas mal armadas, años heredados del semestre anterior y fechas escritas como “por anunciar”. Lo importante no es que la IA acierte siempre, sino que te muestre el resultado para revisarlo antes de guardarlo y que señale las dudas en lugar de inventar un dato.' },
      { question: '¿Cuántos cursos puedo llevar en el plan Gratis de Semora?', answer: 'clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, con una acción de IA para toda la vida de la cuenta. Si llevas más materias, necesitas escanear más de un programa o quieres iniciar un segundo periodo, ahí es donde Pro tiene sentido. El plan no caduca por tiempo, pero ni esa acción de IA ni el límite de semestre se renuevan.' },
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
      'Canvas está hecho para ser el registro oficial de un curso: aquí está la tarea, aquí está la fecha de entrega, aquí está la calificación. También ofrece un Calendario global y una vista Lista con pendientes de todos tus cursos. Lo que no ofrece es una regla configurable que diga «avísame tres días antes», ni una priorización por peso, calificación actual y esfuerzo.',
      'La solución tampoco es abandonar Canvas ni encender todas las alertas hasta que el teléfono vibre sin parar. Primero conviene revisar la configuración que ya tienes, porque ahí suele estar la falla; después, sumar una capa que avise con anticipación y que sepa cuánto pesa cada entrega.',
    ],
    sections: [
      {
        heading: 'Por qué se te pasa una fecha aunque abras Canvas todos los días',
        paragraphs: [
          'Las causas son concretas, pero no todas vienen de falta de una vista conjunta. Canvas sí ofrece un Calendario global y una vista Lista del panel que reúnen tareas y eventos de todos tus cursos.',
          'El límite está en la prioridad: esas vistas ayudan a detectar acumulaciones, pero no ordenan el trabajo según su peso porcentual, tu calificación actual y el esfuerzo estimado, ni envían un recordatorio con la anticipación que tú elijas.',
        ],
        bullets: [
          'Las preferencias de notificación son opcionales y se configuran por categoría, así que es común que la de fecha de entrega esté apagada sin que nadie te lo haya dicho.',
          'Los avisos responden a eventos: se disparan cuando algo ocurre, casi siempre cerca de la fecha o después de ella, no con días de anticipación.',
          'El Calendario global y la vista Lista pueden mostrar que se juntan un ensayo, un parcial y un informe, pero tienes que abrirlas y hacer tú la priorización.',
          'El aviso no dice cuánto vale la tarea, así que una entrega del 2 % y un ensayo del 30 % llegan al teléfono exactamente igual.',
        ],
      },
      {
        heading: 'Revisa la configuración antes de dar por hecho que Canvas falla',
        paragraphs: [
          'La falla más común no es un problema técnico: es una configuración que nunca se tocó. Vale la pena revisarla antes de salir a buscar otra herramienta.',
          'Dentro de Canvas, la ruta suele ser Cuenta y luego Notificaciones. La redacción y el orden cambian según la institución y según las actualizaciones que Canvas hace a su interfaz, así que tómalo como una referencia general y no como un mapa exacto.',
          'Cada categoría se controla por separado y suele ofrecer las mismas opciones de entrega: de inmediato, resumen diario, resumen semanal o nunca. Aquí está el detalle que suele pasarse por alto: un aviso que queda esperando dentro de un resumen semanal es, en la práctica, idéntico a no recibir ningún aviso. Llega cuando ya no cambia nada. Y como la pantalla no distingue entre lo urgente y lo trivial, puedes estar convencido de que «las notificaciones están activadas» mientras la categoría que de verdad importaba está puesta en nunca.',
          'El ajuste de cuenta funciona como valor general para tus cursos, pero Canvas también permite cambiar las notificaciones de una materia concreta. En Cuenta → Notificaciones, elige la materia en el menú «Configuración para», o abre «Ver notificaciones del curso» desde su página principal. Los ajustes de la materia reemplazan a los de la cuenta para ese tipo de aviso.',
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
        heading: 'El calendario global sí junta tus cursos',
        paragraphs: [
          'Canvas ofrece dos vistas cruzadas: el Calendario global reúne tareas y eventos de los cursos seleccionados, y la vista Lista del panel pone pendientes de todos tus cursos en una agenda. Ahí puedes detectar que un ensayo, un parcial y un informe de laboratorio caen en la misma semana.',
          'La limitación no es ver las fechas juntas, sino priorizarlas. Esas vistas no ordenan cada entrega según su peso porcentual, tu calificación actual y el esfuerzo que exige, así que la decisión de qué merece más tiempo sigue siendo tuya.',
          'Semora agrega ese contexto ponderado a las fechas. En Pro, el panel de carga académica y las alertas de riesgo señalan semanas sobrecargadas, calificaciones a la baja y trabajo pendiente.',
        ],
      },
      {
        heading: 'Qué conviene sumarle a Canvas',
        paragraphs: [
          'La importación desde Canvas es gratis y el conector actual usa un token personal. Algunas instituciones desactivan o prohíben su uso con servicios externos; confirma la política de tu universidad. Si no está disponible o permitido, puedes escanear el programa o pegar en Semora la lista de tareas de Canvas.',
          'El plan Gratis incluye una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, además de tareas, fechas de entrega, calificaciones ponderadas y recordatorios el mismo día. Con eso puedes armar ese primer periodo escaneando el programa de la materia que peor tengas controlada, añadir las demás a mano y comprobar cómo se comporta el sistema antes de decidir si quieres además la sincronización automática.',
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
    sources: [
      { label: 'Calendario de Canvas', href: 'https://community.instructure.com/en/kb/articles/662787-how-do-i-use-the-calendar' },
      { label: 'Vista de lista del panel de Canvas', href: 'https://community.instructure.com/en/kb/articles/662819-how-do-i-use-the-to-do-list-for-all-my-courses-in-the-list-view-dashboard-as-a-student' },
      { label: 'Notificaciones de un curso en Canvas', href: 'https://community.instructure.com/en/kb/articles/662905-how-do-i-manage-notifications-for-a-single-course' },
      { label: 'API de preferencias de notificación de Canvas', href: 'https://developerdocs.instructure.com/services/canvas/resources/notification_preferences' },
      { label: 'Documentación OAuth2 de Canvas', href: 'https://canvas.instructure.com/doc/api/file.oauth.html' },
    ],
    faq: [
      { question: '¿Semora reemplaza las notificaciones de Canvas?', answer: 'No. Canvas sigue siendo la fuente oficial y ya ofrece un Calendario global y una vista Lista con elementos de todos tus cursos. Semora aporta recordatorios de uno o tres días y contexto de calificación ponderada.' },
      { question: '¿Con cuánta anticipación puedo recibir un aviso?', answer: 'El plan Gratis envía recordatorios el mismo día. Con Pro eliges uno o tres días de anticipación, lo configuras una vez y se aplica automáticamente a las entregas siguientes; las horas de silencio evitan además que el aviso llegue de madrugada.' },
      { question: '¿Necesito permiso de mi universidad para conectar Canvas?', answer: 'En algunas instituciones, sí. El conector Pro actual usa un token de acceso personal, y los administradores pueden desactivar esos tokens o prohibir introducirlos en servicios externos. Confirma la política de tu universidad; si no está permitido, escanea el programa o pega la lista de tareas.' },
      { question: '¿Qué pasa si el profesor cambia una fecha en Canvas?', answer: 'La siguiente sincronización actualiza la tarea y reajusta los recordatorios vinculados, incluida la anticipación que hayas elegido. El historial muestra cuándo se revisó la plataforma y si alguna actualización falló.' },
      { question: '¿Cuántos cursos puedo llevar sin pagar?', answer: 'clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, con una acción de IA para toda la vida de la cuenta, seguimiento de tareas y calificaciones ponderadas, y recordatorios el mismo día. Una cuenta gratuita no puede iniciar un segundo periodo; Pro quita esos límites y añade el conector de Canvas con token personal, que debes usar solo si tu institución lo permite.' },
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
          'El temporizador es una estructura para empezar y hacer pausas, no una garantía de que cada persona o tarea responda igual. Toma los 25 minutos como punto de partida, mantén una tarea y un entorno comparables durante una semana y ajusta el intervalo si tus notas muestran que otra duración produce más trabajo útil.',
        ],
      },
      {
        heading: 'El hueco que sí tienes',
        paragraphs: [
          'Un día real se parece más a esto: cincuenta minutos entre la clase de las 10 y la de las 11, hora y media alrededor del almuerzo, noventa minutos antes de que el grupo de trabajo se reúna a las 4. Nada de eso es el bloque limpio que asume el manual, pero cada ventana alcanza para trabajo útil si cuentas también el traslado y ya está en tu horario.',
          'Lo que suele pasar con esos huecos es que se van en revisar el teléfono, en una conversación de pasillo o en la conclusión de que «no vale la pena empezar algo por cincuenta minutos». Esa frase es la más cara de todas: da por sentado que el trabajo solo cuenta cuando viene en bloques grandes, y el avance de un semestre se acumula en pedazos, párrafo a párrafo y repaso a repaso.',
        ],
      },
      {
        heading: 'Cómo encajar los ciclos en huecos reales',
        paragraphs: [
          'La adaptación no consiste en cambiar la técnica, sino en medir el hueco de punta a punta antes de empezar. No empieza cuando el profesor deja de hablar, sino cuando ya estás sentado con el material abierto; y no termina cuando suena tu temporizador, sino cuando tienes que estar en el siguiente salón. Guardar las cosas, caminar y hacer la fila del café se restan antes de contar ciclos.',
        ],
        bullets: [
          'Hueco de 50 minutos entre clases: un bloque de 25 minutos y un descanso de 5 ocupan 30 minutos y dejan 20 para guardar tus cosas, caminar o hacer una tarea breve. Dos bloques de 25 con un descanso necesitan 55 minutos, así que no caben.',
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
          'El hueco de 10:00 a 10:50 es el caso de cincuenta minutos: un bloque de 25 y cinco de descanso, con 20 minutos para guardar tus cosas y llegar a la clase de las 11. Es una buena ventana para repasar las tarjetas de estudio de la clase de las 9, mientras el material sigue fresco, o para sacar una respuesta corta de lectura que se entrega más adelante en la semana: algo de alcance cerrado, que no consuma medio bloque solo en arrancar.',
          'La ventana de 12:00 a 13:30 es el caso de noventa minutos: dos ciclos completos y unos 30 minutos de margen para almorzar de verdad, en lugar de comer con una mano y escribir con la otra. Como hay más espacio, aguanta algo de más profundidad: la introducción y la primera sección de un ensayo que se entrega esa semana, o la parte más difícil de una guía de ejercicios. Ese margen final evita llegar a la clase de las 2 con la sensación de venir corriendo.',
          'La tarde libre es el caso de tres horas: la serie completa de cuatro ciclos, con el descanso largo después del cuarto dedicado a comer o a caminar, no saltado. Es el lugar natural para lo que necesita atención sostenida a lo largo de varias sesiones: continuar ese ensayo más allá de la introducción, resolver la guía completa y no solo su primera parte, o alcanzar la lectura que se quedó atrás.',
          'Sumado todo, el día da siete bloques de concentración de 25 minutos repartidos en tres ventanas que ya estaban en el horario, sin bloquear una sola hora nueva. Y el reparto no es intercambiable: las tarjetas de estudio de la clase de las 9 pierden valor si esperan hasta la noche, y el ensayo no gana nada por empezar en el hueco estrecho de la mañana.',
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
          'Puedes empezar con el plan Gratis, que incluye una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total. Pro cuesta $3.99 al mes o $19.99 al año y se compra con tarjeta en la web o dentro de la app.',
        ],
      },
    ],
    sources: [
      { label: 'Historia oficial de la técnica Pomodoro', href: 'https://www.pomodorotechnique.com/francesco-cirillo/' },
      { label: 'Guía original de Francesco Cirillo (PDF)', href: 'https://www.faasafety.gov/files/events/SO/SO15/2024/SO15134204/Cirillo_--_Pomodoro_Technique.pdf' },
    ],
    faq: [
      { question: '¿Tengo que usar exactamente 25 minutos?', answer: 'No. Veinticinco es el valor tradicional, no una regla. Lo que importa es que el bloque termine antes de tu siguiente compromiso y que el objetivo quepa dentro. Para organizar apuntes o repasar tarjetas de estudio, un bloque más corto alcanza; para una lectura densa, uno más largo con un descanso proporcionalmente mayor rinde más. Lo que no conviene mover es el final fijo.' },
      { question: '¿Y si el hueco no alcanza para dos bloques?', answer: 'Haz un ciclo completo con un objetivo pequeño y específico: una sección de ejercicios, un repaso de tarjetas de estudio, el esquema de un párrafo. Es mejor que empezar algo grande sabiendo de antemano que lo vas a dejar cortado, porque el corte te obliga a reconstruir el contexto la próxima vez.' },
      { question: '¿Puedo usar el teléfono durante el descanso?', answer: 'Puedes, pero levantarte, beber agua o mirar a lo lejos suele devolverte más concentración. El riesgo real no es el teléfono en sí, sino que cinco minutos se conviertan en quince sin que lo notes y que el bloque siguiente arranque ya dentro del tiempo de la clase.' },
      { question: '¿Qué hago si me interrumpen a la mitad de un bloque?', answer: 'Pausa el temporizador si la interrupción es corta y retoma donde quedaste. Si perdiste el hilo, cierra el ciclo, toma el descanso y vuelve con un objetivo del tamaño de lo que sí puedes terminar en lo que queda del hueco.' },
      { question: '¿Sirve el Pomodoro para lecturas largas?', answer: 'Sí, pero cambia el objetivo. En vez de «leer el capítulo», define «leer hasta el final de la primera sección y anotar la idea principal de cada parte». Así el bloque termina en un punto medible y no en la página donde te venció el sueño.' },
      { question: '¿Necesito Pro para usar el temporizador de concentración?', answer: 'Sí, forma parte de Semora Pro, que cuesta $3.99 al mes o $19.99 al año y se compra con tarjeta en la web o dentro de la app. El plan Gratis incluye una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, así que puedes montar ese primer periodo antes de decidir.' },
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
          'Armar este plan a mano significa cruzar la fecha del examen, la ponderación y tu calificación actual de cada curso, y rehacerlo cada vez que algo cambia. Semora deja esa información a la vista sin ese trabajo. El seguimiento de calificaciones está en el plan Gratis —junto con una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total— y mantiene al día el promedio ponderado de cada curso conforme se califica tu trabajo, que es el número que pide el paso 2.',
          'Semora Pro cuesta $3.99 al mes o $19.99 al año y agrega el panel de carga académica, que muestra las semanas pesadas y la densidad de exámenes de todos tus cursos en una sola vista: justo la aglomeración que el paso 3 pide detectar con anticipación. El Plan Inteligente arma un horario de estudio con esas fechas y lo reajusta cuando alguna se mueve, y las alertas de riesgo académico señalan un curso donde la calificación viene cayendo.',
        ],
      },
    ],
    faq: [
      { question: '¿Cuándo debo armar el plan?', answer: 'En cuanto tu institución publique el calendario oficial de finales, que sale bastante antes de la semana en sí. Aunque ese día no puedas planificar nada más, anotar la fecha, la hora y la ponderación de cada examen en una sola lista ya deja resuelta la parte difícil.' },
      { question: '¿Cómo priorizo dos exámenes el mismo día?', answer: 'No repartas el tiempo en partes iguales de entrada. Compara la ponderación y la calificación que llevas en cada curso, y recuerda que el examen de la tarde tiene menos margen: las horas previas se te van en el examen de la mañana.' },
      { question: '¿De verdad no sirve estudiar toda la noche anterior?', answer: 'Sirve menos de lo que cuesta. Las mismas horas repartidas en varios días retienen más, y llegar sin dormir afecta justo lo que el examen mide: recuperar información bajo presión. Fija una hora tope para cerrar los apuntes la noche previa y respétala.' },
      { question: '¿Qué hago si ya no alcanza el tiempo?', answer: 'Recorta a conciencia en lugar de fingir que todo cabe. Quédate con los temas de mayor peso en el examen y con los que peor dominas, y cambia la lectura pasiva por práctica activa: resolver ejercicios en frío rinde más que releer el capítulo entero.' },
      { question: '¿Necesito Pro para organizar mis finales?', answer: 'No. Las fechas, los cursos y el seguimiento de calificaciones están en el plan Gratis, que incluye una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total. Pro agrega el panel de carga académica, el Plan Inteligente y las alertas de riesgo académico, que automatizan buena parte de los pasos 2 y 3.' },
      { question: '¿Y si el programa y el calendario oficial no coinciden?', answer: 'Rige el calendario oficial de tu institución, que se publica después del programa justamente para resolver choques entre materias. Si la diferencia es de ponderación y no de fecha, pregúntale al profesor y deja registrado el dato correcto donde lleves tus cursos.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[6].path, SPANISH_BLOG_POSTS[6].englishPath, 'standard', {
    metaTitle: 'Apps de estudio con IA para universitarios (2026)',
    metaDescription: 'Siete apps comparadas por escaneo de programas, tarjetas, tutoría, planificación y seguimiento de calificaciones.',
    h1: SPANISH_BLOG_POSTS[6].title,
    lede: '«App de estudio con IA» describe por lo menos tres productos distintos que resuelven tres problemas distintos, y casi toda la decepción viene de comprar una categoría esperando otra.',
    intro: [
      'Las apps centradas en el programa (Semora, DormWay) leen los documentos de tus materias y arman un semestre de fechas de entrega. Las centradas en el material (StudyFetch, Mindgrasp, Studley AI) convierten un PDF o la grabación de una clase en tarjetas de estudio, apuntes y cuestionarios. Las centradas en la agenda (Shovel, myHomework) organizan el tiempo y las tareas que tú registras o importas.',
      'Solo la primera categoría responde «qué se entrega y cuánto vale». Solo la segunda responde «ayúdame a aprender este capítulo». Si necesitas las dos cosas, la respuesta honesta suele ser una app de cada categoría, o una sola que cubra la estructura del semestre y genere material de estudio desde esa misma fuente.',
      'Los precios que aparecen abajo van desde gratis hasta unos $12.88 al mes. Todo lo que sigue proviene de los materiales publicados por cada producto o, cuando se indica, de reseñas de terceros.',
      'Semora publica esta comparación y es uno de los productos incluidos. Es una revisión de escritorio de páginas de producto, precios, documentación y fichas de tienda consultadas en agosto de 2026; no afirmamos haber probado personalmente cada app. Confirma las funciones y los precios actuales con el proveedor.',
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
            ['Shovel', 'Bloques de tiempo: las fechas se vuelven un calendario de estudio', 'Sí. PDF procesado con pantalla de revisión, o conectando un LMS', 'No está confirmado públicamente como función central', 'Sus páginas oficiales difieren: prueba de 7 días y luego $9.79/mes o $39/año; otra página muestra $33/mes o $16/mes con pago anual'],
            ['StudyFetch', 'El tutor Spark.E, que responde desde tus propios materiales', 'Parcial. Fotografías el programa y extrae eventos, por cada subida', 'No es un libro de calificaciones dedicado: sus funciones de evaluación se centran en ensayos y simulacros de examen', 'Plan gratuito; reportado en ~$7.99–$11.99/mes'],
            ['Mindgrasp', 'Un archivo subido → apuntes, tarjetas y cuestionario', 'No se encontró análisis de programas en sus materiales públicos', 'No está confirmado públicamente', 'Con pago anual: $5.99–$10.99/mes, facturados como $71.88–$131.88 al año'],
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
          'Semora importa un programa como foto (varias páginas, hasta cinco), PDF, archivo arrastrado en la versión web, o texto pegado. OpenAI GPT-5.6 Luna extrae el nombre del curso, el profesor, los horarios de clase, el horario de atención, las fechas del semestre, la escala de calificación y cada elemento evaluado con su fecha de entrega. Revisas y corriges cada entrega antes de añadirla al calendario, y eso importa más de lo que parece: los programas están llenos de frases ambiguas como «se entrega el viernes anterior al receso», y una pantalla de revisión es la diferencia entre detectar una fecha mal interpretada y heredarla. El plan Gratis cubre una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, además de seguimiento completo de entregas y de calificaciones con promedios ponderados y recordatorios el mismo día. Pro, a $3.99 al mes o $19.99 al año, levanta los límites de acciones de IA, cursos y semestres y agrega importación desde Canvas, Blackboard y Moodle. El conector actual de Canvas usa un token personal y algunas instituciones desactivan o prohíben su uso con servicios externos; si no está permitido, escanea el programa o pega la lista de tareas. Pro también añade el Plan Inteligente de estudio, el panel de carga académica, tarjetas de estudio con repetición espaciada, temporizador de concentración, un tutor con IA basado en tu propio material, sincronización con el calendario y exportación .ics, horarios de recordatorio personalizados y alertas de riesgo académico.',
          'DormWay recibe programas subidos en la app o enviados por correo a su dirección de recepción, y extrae tareas, fechas de examen, desglose de calificación y políticas de entrega tardía. También ofrece sincronización de solo lectura con Canvas, Blackboard y Moodle unificadas en una sola línea de tiempo, una calculadora de GPA y calificaciones con categorías ponderadas, un asistente llamado «Ace» que responde preguntas sobre las políticas del curso citando el punto del programa de donde salió la respuesta, y una pestaña de «Intelligence» por curso con estimación de dificultad y horas semanales. Su propio sitio y su ficha en la App Store lo describen como gratuito, sin muros de pago y sin tarjeta de crédito. Funciona en web, iPhone, iPad y Mac; no tiene app para Android.',
          'La división práctica: DormWay no cuesta nada, cubre tres plataformas LMS en modo lectura desde el inicio, y su app para Mac es algo que Semora no tiene. Las ventajas de Semora son la variedad de entrada (la foto de un programa en papel que te entregaron en clase, no solo un archivo que ya tienes), el paso de revisión antes de guardar, y la profundidad del lado del estudio: tarjetas con repetición espaciada, temporizador, tutor y un generador de horarios que se reajusta con tus fechas. Si el costo es la restricción que decide, el plan gratuito de DormWay es realmente gratuito. Si quieres la capa de fechas y la de estudio en la misma cuenta, ese es el argumento a favor de Semora Pro.',
        ],
      },
      {
        heading: 'Centradas en el material: StudyFetch, Mindgrasp y Studley AI',
        paragraphs: [
          'Es la categoría más concurrida y aquella donde el marketing suena más parecido. Las tres reciben contenido y devuelven material de estudio. Las diferencias están en qué aceptan, qué producen y si algo se conecta con tus cursos reales.',
          'StudyFetch está construido alrededor de Spark.E, un tutor que responde a partir de tus propios materiales en lugar de la web abierta, una distinción con consecuencias: hace que las respuestas sean rastreables hasta algo que tu profesor efectivamente asignó. Genera tarjetas, cuestionarios y simulacros de examen a partir de lo que subes, ofrece planes de estudio con repetición espaciada y da retroalimentación sobre ensayos. Sí tiene una función de programa: fotografías un programa o un calendario y Spark.E extrae los eventos a un calendario con recordatorios. Según las descripciones disponibles, funciona por cada subida y no agregando automáticamente las fechas de todos tus cursos. StudyFetch también documenta una integración LTI 1.3 con Canvas, Blackboard, Schoology, D2L Brightspace y Google Classroom con sincronización de listas, pero esa la implementa la institución, no el estudiante, así que solo está disponible si tu universidad ya la configuró. Reseñas de terceros reportan un plan gratuito (alrededor de 10 conversaciones con el tutor, un conjunto de estudio y dos subidas), un plan Base cercano a $7.99 al mes, uno Premium cercano a $11.99, un paquete semestral cercano a $49.99 y un plan anual cercano a $99.99; nada de eso está confirmado en la propia página de precios de StudyFetch, así que conviene verificarlo antes de comprar. Funciona en web, iOS y Android.',
          'Mindgrasp tiene el rango de entrada más amplio: PDF, DOCX, PowerPoint, MP3 y MP4, videos de YouTube y artículos web. Le das cualquiera de esos y produce apuntes, resúmenes, tarjetas y cuestionarios, con un tutor con IA para preguntas de seguimiento y un plan superior que agrega un experto en matemáticas. Declara compatibilidad con Canvas, Blackboard y Panopto, lo que parece significar importar archivos de esas plataformas y no analizar programas ni fechas. No aparece ninguna función de análisis de programas ni de extracción de fechas en sus materiales públicos, ni seguimiento de calificaciones. Con la opción anual activa el 9 de agosto de 2026, su selector oficial mostraba Basic a $5.99 al mes facturados como $71.88 una vez al año, Scholar a $8.99 al mes facturados como $107.88 al año y Premium a $10.99 al mes facturados como $131.88 al año. El sitio oficial también anuncia una prueba gratuita; confirma la oferta y los precios de pago mensual al finalizar la compra. Se distribuye como app de iOS, app web y extensión de Chrome; la disponibilidad en Android no es clara.',
          'Studley AI acepta PDF, diapositivas, videos de YouTube, enlaces a artículos y fotos de apuntes escritos a mano, y los convierte en tarjetas, cuestionarios y material de estudio en audio. Una función llamada «Solve» da ayuda paso a paso con tareas a partir de una foto, y un tutor con IA responde preguntas sobre lo que subiste. Mide el dominio de ese material en cuatro niveles, de desconocido a dominado, lo cual es seguimiento de progreso, pero de tu memoria, no de tu calificación. No aparecen integraciones con LMS ni análisis de programas en sus materiales disponibles. El plan gratuito cubre un conjunto de estudio al día; el plan Unlimited está reportado por reseñas de terceros en $12.88 al mes o $97.76 al año. Funciona en iOS, Android y web.',
          'Ninguna de las tres intenta ser tu agenda, y leerlas como agendas es el error. En lo que sí son buenas es en el último tramo antes de una evaluación: ya tienes el material, tienes poco tiempo y quieres convertirlo en algo que puedas practicar activamente en vez de releer.',
        ],
      },
      {
        heading: 'Centradas en la agenda: Shovel y myHomework',
        paragraphs: [
          'Shovel es la app con la postura más definida de esta lista, y la postura es buena: conocer una fecha de entrega no es lo mismo que tener tiempo para cumplirla. Procesa un PDF del programa con pantalla de revisión, o se conecta en modo lectura a Canvas, Brightspace, Moodle y Google Classroom, actualizándose aproximadamente cada 24 horas, y después hace lo que las demás no hacen: compara el tiempo que van a tomar tus tareas contra el tiempo que realmente tienes, y lo reserva en el calendario. Sus alertas «Cushion» avisan cuando te comprometiste a más de lo que cabe, y estima el tiempo de lectura a partir del número de páginas. El seguimiento de calificaciones no está confirmado como función central; sus materiales públicos hablan de planificación. Sus páginas oficiales no coincidían el 9 de agosto de 2026: la página de precios mostraba una prueba de 7 días seguida de $9.79 al mes (con $19.99 tachado) o $39 al año, mientras que la página de compra enlazada desde la navegación mostraba $33 al mes con pago mensual o $16 al mes con pago anual. Confirma el importe en la pantalla de pago. La configuración empieza en la app web, con iOS y Android nativos como acompañantes.',
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
          'El patrón que conviene notar: los planes gratuitos de la categoría centrada en el material son demostraciones, dimensionadas para enseñarte el producto antes del muro de pago. Los de las categorías centradas en el programa y en la agenda son utilizables: el de DormWay indefinidamente, el de Semora para un semestre entero con Canvas sincronizado gratis, el de myHomework con anuncios. Esa diferencia es de estructura de costos, no de generosidad: generar tarjetas y respuestas de tutor le cuesta dinero al proveedor cada vez que se usa; guardar una fecha de entrega, no.',
        ],
        table: {
          columns: ['App', 'Qué incluye el plan gratuito', 'El límite principal'],
          highlightColumn: 0,
          caption: 'Detalles de los planes gratuitos según lo publicado por cada proveedor, agosto de 2026. Los planes gratuitos cambian más seguido que los de pago.',
          rows: [
            ['Semora', '1 acción de IA para toda la vida de la cuenta (un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento), clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, seguimiento completo de entregas y de calificaciones con promedios ponderados, recordatorios el mismo día y unirte a un curso que comparta un compañero', 'Esa acción de IA no se renueva, y es un curso a mano en un solo semestre (Canvas no cuenta y no tiene tope): una cuenta gratuita no puede abrir un segundo periodo'],
            ['DormWay', 'Todo. El producto es gratuito y no tiene plan de pago, incluidas la sincronización con el LMS y la calculadora de calificaciones', 'No hay app para Android, y la sincronización con las tres plataformas LMS es de solo lectura'],
            ['Shovel', 'Una prueba de 7 días en lugar de un plan gratuito permanente, según su página de precios', 'Es una prueba; las dos páginas oficiales consultadas muestran precios distintos después'],
            ['StudyFetch', 'Reportado en unas 10 conversaciones con el tutor, 1 conjunto de estudio y 2 subidas', 'Lo bastante pequeño como para funcionar como demostración y no como un plan de uso continuo'],
            ['Mindgrasp', 'El sitio oficial anuncia una prueba; no se documenta un plan gratuito permanente', 'El selector oficial publica precios equivalentes mensuales con facturación anual'],
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
          'Si quieres probar el enfoque centrado en el programa sin gastar nada, el plan Gratis de Semora cubre un semestre entero con Canvas sincronizado gratis y sin límite de clases, con seguimiento completo de entregas y de calificaciones, y basta con una foto de un programa para ver si la extracción aguanta con tus propios documentos, que es la única prueba que importa.',
        ],
      },
    ],
    sourceNote: 'Estos enlaces son las fuentes primarias del contraste; las cifras que el artículo marca como «reportadas» provienen de cobertura externa y siguen sin verificarse.',
    sources: [
      { label: 'Funciones de Semora', href: '/es/funciones' },
      { label: 'Precios de Semora', href: '/es/precios' },
      { label: 'DormWay para estudiantes', href: 'https://dormway.app/for-students' },
      { label: 'Precios de DormWay', href: 'https://dormway.app/pricing' },
      { label: 'Centro de ayuda de Shovel', href: 'https://help.shovelapp.io/en' },
      { label: 'Precios de Shovel', href: 'https://shovelapp.io/pricing/' },
      { label: 'Página de compra de Shovel', href: 'https://shovelapp.io/buy/' },
      { label: 'Sitio oficial de StudyFetch', href: 'https://www.studyfetch.com/' },
      { label: 'StudyFetch en App Store', href: 'https://apps.apple.com/us/app/studyfetch-make-learning-easy/id6663574866' },
      { label: 'Sitio oficial de Mindgrasp', href: 'https://www.mindgrasp.ai/' },
      { label: 'Selector de planes de Mindgrasp', href: 'https://app.mindgrasp.ai/pick-plan' },
      { label: 'Sitio oficial de Studley', href: 'https://www.studley.ai/' },
      { label: 'Studley en Google Play', href: 'https://play.google.com/store/apps/details?id=ai.studley.app' },
      { label: 'myHomework en App Store', href: 'https://apps.apple.com/us/app/myhomework-student-planner/id303490844' },
    ],
    faq: [
      { question: '¿Cuál es la mejor app de estudio con IA para universitarios?', answer: 'No hay una sola respuesta, porque las apps resuelven tres problemas distintos. Si tu problema es que se te pasan las entregas, la solución es una app centrada en el programa como Semora o DormWay. Si tu problema es aprender el material antes de un examen, una app centrada en el material como StudyFetch, Mindgrasp o Studley AI genera tarjetas, apuntes y cuestionarios de lo que subes. Si tu problema es no empezar con tiempo, una app centrada en la agenda como Shovel te reserva las horas. Elige de la categoría que corresponda a la falla que te sigue pasando.' },
      { question: '¿Hay alguna app gratuita con IA que escanee programas de clase?', answer: 'Sí. DormWay es gratuita, no tiene plan de pago y analiza programas subidos en la app o enviados por correo a su dirección de recepción. Semora tiene un plan Gratis con una acción de IA para toda la vida de la cuenta —un escaneo de programa, por ejemplo—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, además de seguimiento completo de entregas y de calificaciones con promedios ponderados y recordatorios el mismo día. Las dos te dejan comprobar si la extracción funciona con tus propios programas antes de pagar nada.' },
      { question: '¿Una app con IA puede leer mi programa y agregar todas las fechas automáticamente?', answer: 'Las apps centradas en el programa hacen exactamente eso: extraen cada tarea, examen, cuestionario, proyecto y lectura con su fecha, y normalmente también las ponderaciones, los horarios de clase y las fechas del semestre. Lo que no pueden es resolver toda ambigüedad a la perfección. Los programas traen exámenes «por definir», entregas semanales escritas en una sola línea y fechas relativas a la sesión de clase. Por eso un paso de revisión antes de guardar importa más que el modelo que haya detrás.' },
      { question: '¿Necesito más de una app de estudio?', answer: 'A menudo sí, porque las categorías fallan en direcciones opuestas. Un generador de tarjetas no puede decirte cuándo es tu parcial, y una agenda no puede ayudarte a aprender el capítulo. La combinación habitual es una app que se haga cargo de la estructura del semestre y otra del material de estudio, o una sola que haga ambas desde la misma fuente, que es lo que hace Semora al generar tarjetas del programa y los apuntes que ya tiene.' },
      { question: '¿Cuánto cuestan las apps de estudio con IA?', answer: 'Esta comparación mezcla productos gratuitos, suscripciones mensuales y equivalentes mensuales que se cobran por año. DormWay es gratuita sin plan de pago y myHomework es gratuita con anuncios. Semora Pro cuesta $3.99 al mes o $19.99 al año. Con pago anual, el selector oficial de Mindgrasp mostraba entre $5.99 y $10.99 al mes, facturados como $71.88–$131.88 al año. Las propias páginas de Shovel se contradicen: una mostraba una prueba de 7 días seguida de $9.79 al mes o $39 al año, y otra $33 al mes con pago mensual o $16 al mes con pago anual. Los precios de StudyFetch y Studley AI citados aquí proceden de cobertura externa. Confirma siempre la frecuencia y el importe en la pantalla de pago.' },
    ],
  }),
  page(SPANISH_BLOG_POSTS[7].path, SPANISH_BLOG_POSTS[7].englishPath, 'standard', {
    metaTitle: 'Tarjetas de estudio con IA desde tus apuntes',
    metaDescription: 'Cómo crear, verificar y repasar tarjetas con IA, y qué herramientas generan tarjetas a partir de tus materiales.',
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
            ['Mindgrasp', 'Un solo archivo subido: PDF, DOCX, PPT, MP3/MP4, YouTube o artículos web', 'No se encontró análisis de programas ni de fechas en sus materiales públicos', 'No está documentada como función de calendario', 'Con pago anual: $5.99–$10.99/mes, facturados como $71.88–$131.88 al año'],
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
    sources: [
      { label: 'Roediger y Karpicke: práctica de recuperación y retención', href: 'https://pubmed.ncbi.nlm.nih.gov/16507066/' },
      { label: 'Cepeda y colaboradores: síntesis cuantitativa del efecto de espaciamiento', href: 'https://pubmed.ncbi.nlm.nih.gov/16719566/' },
    ],
    faq: [
      { question: '¿La IA puede hacer tarjetas de estudio a partir de mis apuntes de clase?', answer: 'Sí. Los cuatro generadores de tarjetas de esta comparación —Semora, StudyFetch, Mindgrasp y Studley AI— convierten material del curso en tarjetas de pregunta y respuesta; los formatos admitidos varían según la herramienta. DormWay y myHomework aparecen en la tabla como referencia, pero ninguna documenta públicamente una función de tarjetas. Generar toma segundos. El trabajo que decide si el mazo sirve viene después: recortar las tarjetas que no evalúan nada, dividir cualquier tarjeta cuya respuesta ocupe más de una o dos oraciones, y verificar los datos contra tus propios apuntes antes del primer repaso.' },
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
            ['Shovel', 'No está confirmado públicamente como función central', 'No está documentado: sus materiales públicos tratan de bloques de tiempo y planificación', 'No aplica', 'Páginas oficiales en conflicto: $9.79/mes o $39/año frente a $33/mes o $16/mes con pago anual'],
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
      { question: '¿Puedo probar Semora gratis?', answer: 'Sí. El plan Gratis no requiere tarjeta e incluye una acción de IA para toda la vida de la cuenta, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, además de fechas de entrega y calificaciones.' },
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
    { heading: 'Qué puedes probar sin pagar', paragraphs: ['Crea una cuenta sin tarjeta y obtén una acción de IA para toda la vida de la cuenta —un escaneo de programa, una grabación de clase o unos apuntes a partir de un documento—, clases ilimitadas sincronizadas gratis desde Canvas, más un curso que añades a mano, y un semestre total, además de seguimiento de entregas, promedios ponderados y recordatorios el mismo día.'] },
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
