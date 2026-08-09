/**
 * Contenido largo en español para cada página /es/funciones/{slug}.
 *
 * Espejo de lib/feature-content.ts. Existe porque las páginas de función en
 * español se generaban desde una plantilla — «por qué», cuatro pasos y un
 * resultado, unos 450 caracteres — mientras las inglesas llevaban entre 18.000 y
 * 24.000 caracteres escritos a mano. Ocho páginas idénticas entre sí no son una
 * traducción: son un marcador de posición.
 *
 * Cada entrada aquí cubre la misma información que su equivalente inglesa,
 * escrita en español y no traducida frase a frase, con el vocabulario de la app:
 * programa, entrega, tarea, curso, calificación, semestre, Tutor, Tarjetas de
 * estudio, Plan Inteligente, carga académica.
 *
 * La clave es el slug INGLÉS, igual que en FEATURE_DETAILS, para que el
 * generador de es-content.ts pueda buscarla sin otra tabla de equivalencias.
 */

export interface EsFeatureSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface EsFeatureLongForm {
  lede: string;
  intro: string[];
  sections: EsFeatureSection[];
}

export const ES_FEATURE_CONTENT: Record<string, EsFeatureLongForm> = {
  'syllabus-scanner': {
    lede: 'Fotografía, sube o pega el programa y Semora te devuelve el curso, el horario de clases, la escala de calificación y todas las fechas que encuentre. Tú revisas la lista antes de que se guarde un solo elemento.',
    intro: [
      'La primera semana te deja cuatro o cinco programas, cada uno de ocho a veinte páginas, y las fechas que de verdad necesitas están enterradas entre la política de asistencia y el apartado de integridad académica. Cuándo es el parcial. Cuánto vale el proyecto final. Si el viernes hay clase o laboratorio. Está todo ahí, y sacarlo significa leerse cada página y después teclearlo en otro sitio.',
      'Así que la mayoría no hace ni una cosa ni la otra. El PDF se queda en el archivo adjunto, las fechas viven en tu cabeza hasta que dejan de vivir ahí, y la primera sorpresa de verdad llega en la semana seis, cuando dos exámenes caen en las mismas 48 horas y un proyecto que habías olvidado vale el 25 % de la nota.',
      'El escáner es el atajo. Fotografía el programa, sube el PDF o pega el texto, y entre 10 y 30 segundos después tienes un curso con su profesor, un horario de clases con días y aulas, los cortes de la escala de notas que imprimió tu profesor, y una lista de cada tarea, cuestionario, examen, proyecto y lectura que haya podido encontrar, cada uno con su fecha, su hora si estaba indicada, y su peso sobre la nota final. Y ahí se detiene. El curso, sus horarios y su escala quedan archivados, pero no se guarda ni una sola entrega hasta que miras la lista y la apruebas.',
    ],
    sections: [
      {
        heading: 'Cuatro vías de entrada en el móvil, dos más en la web',
        paragraphs: [
          'La pestaña de escaneo es una sola pantalla con una lista corta de opciones, porque la entrada nunca es igual dos veces. A veces el programa es un PDF en tu correo. A veces es un papel grapado que el profesor repartió en clase. A veces es una página web del campus de la que solo puedes copiar el texto. Cada una tiene su camino, y ninguno es mejor que otro: el mejor es el que te evita pasos.',
          'Los escaneos con foto admiten hasta cinco páginas por escaneo, y las cinco cuentan como uno solo. El camino de la cámara vuelve a abrir el obturador después de cada disparo y te pregunta si quieres añadir otra página o escanear lo que ya tienes; si sales a mitad, lo capturado no se pierde.',
          'También hay un tope de tamaño, y Semora lo aplica mientras capturas y no después de que hayas terminado. El tamaño combinado en bruto de un escaneo con fotos se presupuesta en 10 MB. La primera página siempre entra; a partir de ahí la app avisa antes de dejarte añadir algo que luego sería rechazado, que es justo lo contrario de descubrirlo al final.',
        ],
        bullets: [
          'Tomar una foto: hasta 5 páginas en un escaneo, capturadas de una en una, con una pregunta después de cada disparo. Si sales a mitad, lo capturado se conserva.',
          'Subir PDF: el selector de archivos solo admite PDF y el documento entero va al analizador de una vez. Sin tope de páginas.',
          'Elegir de Fotos: selección múltiple de hasta 5 imágenes de tu fototeca, en el orden en que las toques.',
          'Elegir de Archivos: iCloud Drive, Google Drive o cualquier sitio al que llegue la app Archivos. Acepta PDF, JPG, PNG, HEIC y HEIF.',
          'Arrastrar y soltar (web): el propio marco de escaneo es la zona de destino. Su borde se ilumina y la etiqueta cambia mientras arrastras.',
          'Pegar texto (solo web): entre 20 y 60.000 caracteres, con un contador en vivo. Esta vía se salta la lectura de imagen por completo.',
        ],
      },
      {
        heading: 'Qué sale realmente de la página',
        paragraphs: [
          'La extracción no es un muro de texto con las fechas resaltadas. Al modelo se le pide un único objeto estructurado con campos con nombre, y cada campo se valida en el servidor antes de llegar a ti, así que una fecha mal escrita se convierte en un hueco que corriges en la pantalla de revisión y no en una fila corrupta dentro de tu curso.',
          'Los horarios de clase son la parte que casi nadie espera. Una asignatura que tiene teoría los lunes, miércoles y viernes y laboratorio el martes por la tarde vuelve como dos bloques separados, no como una entrada borrosa, con sus días, sus horas de inicio y fin, su tipo y su aula.',
          'La escala de calificación es la otra victoria silenciosa. Si tu programa indica los cortes en algún sitio, vuelven como letra más porcentaje mínimo, ordenados de mayor a menor, con los más y los menos incluidos. Es lo que convierte «voy por un 86,7 %» en «voy por un B+ según la escala de esta asignatura».',
        ],
        bullets: [
          'Nombre y código del curso, combinados en un título legible y recortado si hace falta.',
          'Nombre del profesor, cuando aparece en el documento.',
          'Bloques de clase: días de la semana, hora de inicio y fin, tipo (teoría, laboratorio, seminario u otro) y aula.',
          'Bloques de horario de atención: días, horas y lugar, con los días vacíos cuando es con cita previa.',
          'Nombre del semestre y fechas de inicio y fin, cada una validada como fecha real antes de guardarse.',
          'Escala de calificación: letra y porcentaje mínimo, ordenada de mayor a menor.',
          'Entregas: título, tipo (tarea, cuestionario, examen, proyecto, lectura u otro), fecha, hora, porcentaje y una puntuación de confianza.',
        ],
      },
      {
        heading: 'No se guarda nada hasta que lo apruebas',
        paragraphs: [
          'La pantalla de revisión no es un trámite y no se puede saltar. Se abre con un recuento de elementos encontrados y de elementos seleccionados, un interruptor para seleccionar todo, y una tarjeta por cada elemento extraído. Cada tarjeta lleva su casilla, su título editable, su tipo, su fecha, su hora y su ponderación.',
          'La pantalla también señala su propia incertidumbre en lugar de esconderla. Cualquier elemento que el modelo puntúe por debajo de 0,8 de confianza lleva una etiqueta de «Poca confianza — revísalo». Cualquier fecha que se interprete bien pero caiga fuera del semestre que el propio programa declara se marca aparte, porque suele ser un año mal escrito.',
          'Los elementos que el programa menciona sin fecha tienen su propia sección al final, «Falta la fecha». Un examen final que aparece como «por confirmar» no se tira a la basura ni se guarda en silencio con una fecha inventada: se queda ahí esperando a que tú decidas.',
          'Guardar es todo o nada. Todos los elementos seleccionados entran como un único lote, así que nunca acabas con nueve de tus doce entregas y sin saber cuáles tres desaparecieron. Si el guardado falla, te quedas en la pantalla con tu selección intacta.',
        ],
      },
      {
        heading: 'Qué construye Semora a partir de la extracción',
        paragraphs: [
          'La extracción solo sirve si se convierte en estructura de verdad, así que la app la archiva como lo habrías hecho tú a mano. El semestre sale del propio programa cuando este lo nombra; si no lo hace, Semora recurre al semestre que tengas activo.',
          'El emparejamiento de cursos es deliberadamente estricto. Semora compara el código del curso como prefijo y después comprueba que el siguiente carácter sea un límite real, de modo que escanear «CS 10» no se funde en silencio con tu «CS 101». Cuando el programa no trae código, se empareja por nombre exacto.',
          'Reescanear se trata con cuidado. Los horarios de clase y de atención solo se escriben cuando el curso se crea por primera vez, así que importar un programa actualizado nunca borra el aula que corregiste a mano. La escala de calificación se sustituye únicamente si seguía como estaba por defecto.',
        ],
      },
      {
        heading: 'El límite gratuito, dicho con precisión',
        paragraphs: [
          'Escanear es una función gratuita con un número real detrás: cinco escaneos por mes natural. La ventana es el mes natural en UTC, así que la cuenta se reinicia el día 1, y ese mismo límite lo aplican la app, el servidor antes de gastar nada en la extracción, y un disparador de la base de datos.',
          'No te quedas adivinando en qué punto estás. La pestaña de escaneo muestra una etiqueta del tipo «Te quedan 3 de 5 escaneos gratis este mes», que se pone en rojo al llegar a cero. Antes de gastar el último, Semora te interrumpe para avisarte de que es el último.',
          'Hay otros dos límites que conviene conocer porque son independientes del recuento de escaneos: una cuenta gratuita admite hasta cuatro cursos por semestre y un semestre a la vez. Importa aquí porque un escaneo que crearía un quinto curso topa con el límite de cursos aunque te sobren escaneos.',
          'Pro elimina por completo los topes de escaneos y de cursos, por 3,99 $ al mes o 19,99 $ al año, que sale a unos 1,67 $ al mes en el plan anual. Pro se compra dentro de la app de iOS y la suscripción se aplica a toda la cuenta, incluida la web. Lo único que queda por encima es un techo de uso razonable: 20 escaneos en cualquier ventana de 24 horas.',
        ],
      },
      {
        heading: 'Cuando el documento no es un programa, y otros casos incómodos',
        paragraphs: [
          'Lo primero que se le pregunta al modelo no es «cuáles son las fechas» sino «¿esto es de verdad un programa?». Un recibo, una tarjeta de embarque, un artículo, una captura cualquiera o la foto de la página equivocada se rechazan con un mensaje que dice exactamente eso, en lugar de devolverte tres fechas inventadas.',
          'Ese rechazo no te cuesta un escaneo gratuito. Solo cuentan las extracciones correctas. Sí cuenta como uno de los 20 intentos permitidos en una ventana móvil de 24 horas, así que apuntar la cámara a algo que no es un programa no te sale gratis del todo, pero tampoco te gasta el mes.',
          'Los demás fallos tienen su propio tratamiento en vez de un error genérico. Un programa tan denso que la respuesta se corta a mitad de estructura devuelve un mensaje concreto que sugiere escanear un curso, o menos páginas, cada vez.',
          'Reescanear un programa que ya importaste también se detecta. Semora te dice que el curso ya existe en ese semestre y te ofrece dos opciones honestas: abrir el curso existente o crear uno duplicado aparte, y te deja elegir a ti.',
        ],
      },
      {
        heading: 'Escaneos de varias páginas y programas realmente largos',
        paragraphs: [
          'Los programas en papel suelen ir grapados, y una tabla de calendario casi nunca cabe en una página. Cuando haces varias fotos de una vez, se envían juntas al modelo con una instrucción explícita de que son páginas de un mismo documento y no documentos distintos.',
          'Cinco páginas es el tope con foto, y la app te lo dice en lugar de desactivar el obturador sin explicación: te avisa de que los escaneos con foto admiten hasta cinco páginas, te ofrece escanear lo que ya capturaste y te propone subir un PDF si el programa es más largo.',
          'Cada página que escaneas se conserva. La primera se guarda en la ruta registrada del escaneo y el resto quedan al lado con sufijos numerados, así que la pantalla del curso puede ofrecerte después un selector de páginas.',
        ],
      },
      {
        heading: 'Dónde aparece un escaneo en el resto de Semora',
        paragraphs: [
          'El escaneo es la puerta de entrada, no una herramienta suelta. Todo lo que produce son datos normales de Semora desde el momento en que los guardas, y por eso el escáner es gratis: es lo que hace que el resto de la app funcione.',
          'Las entregas se convierten en tareas de la pestaña Hoy —ordenadas en atrasadas, vencen hoy y esta semana— con recordatorios el mismo día en el plan gratuito. Las ponderaciones alimentan el seguimiento de calificaciones, así que un promedio ponderado aparece sin que tengas que teclear ningún porcentaje.',
          'Del lado de Pro, esa misma extracción alimenta el horario del Plan Inteligente y la vista de semanas cargadas de la carga académica, y ambos valen exactamente lo que valgan las entregas que tengan. El Tutor con IA responde desde el programa de ese curso, y las tarjetas de estudio se generan a partir del mismo material.',
        ],
      },
      {
        heading: 'Para quién es de verdad, y cuándo usar otra cosa',
        paragraphs: [
          'Está pensado para un estudiante con un programa que contiene un calendario: una tabla de semanas y fechas, una lista de exámenes, un desglose de la calificación. Si tu profesor escribe un programa de verdad, esto convierte media hora de tecleo en un par de minutos de revisión.',
          'Encaja peor en unos cuantos casos, y conviene decirlos. Si tu programa no trae ninguna fecha porque todo vive en la plataforma académica, no hay nada en la página que extraer: ahí la vía es la sincronización con Canvas. Si lo que tienes es una foto borrosa o torcida de una fotocopia, el resultado será peor que el de un PDF nítido.',
          'Una expectativa más que conviene dejar clara: el escaneo se cuenta cuando la extracción sale bien, no cuando guardas. Si los resultados vuelven y cierras la app sin guardar nada, el trabajo ya se hizo y el escaneo ya se contó.',
        ],
      },
    ],
  },

  'grade-tracking': {
    lede: 'Introduce lo que sacaste en cada entrega y Semora mantiene un promedio ponderado sobre el trabajo que ya está corregido, aplicando las categorías de tu asignatura, las notas más bajas descartadas y los cortes de letra. Está en el plan gratuito.',
    intro: [
      'Tu programa ya te dice cómo se puntúa la asignatura. Tareas 20 %, dos parciales de 20 cada uno, un final que vale 30, participación el 10 restante. Después empieza el semestre y las notas llegan de una en una, desordenadas y en escalas distintas: un 88 en un laboratorio sobre 50 puntos, un 7 sobre 10 en un cuestionario, un parcial sobre 100.',
      'Promediarlas no funciona. Un 100 en un cuestionario de lectura que vale el dos por ciento no compensa un 71 en un parcial que vale la cuarta parte de la asignatura, y fingir que sí es como la gente se lleva el susto en la semana once. Dividir entre la ponderación de todo el semestre tampoco funciona: cuenta como cero todo lo que aún no se ha corregido.',
      'El seguimiento de calificaciones de Semora hace la aritmética que describe tu programa, sobre el trabajo que ya está corregido y nada más. Introduces una nota, se actualiza un promedio ponderado, se deduce una letra a partir de la escala de tu asignatura y todo se agrupa en una nota media del semestre.',
    ],
    sections: [
      {
        heading: 'Registrar una nota lleva unos cinco segundos',
        paragraphs: [
          'Abre cualquier tarea y verás un bloque de calificación recibida. Eliges uno de los dos modos de entrada y escribes lo que publicó tu profesor.',
          'El modo de puntos viene por defecto y lleva un ejemplo en la etiqueta: Puntos (13/15). Introduces los puntos obtenidos y los puntos posibles. Ese total son los puntos propios de la entrega, nunca su peso en la asignatura: un parcial que vale el 20 % de la nota puede estar puntuado sobre 75 puntos, y lo que va en esa casilla es el 75.',
          'El modo de porcentaje es un único campo con un número del 0 al 100. Cambiar de modo borra lo que hubieras escrito, así que nunca envías por accidente una cifra de puntos dentro de una casilla de porcentaje.',
          'Las protecciones son concretas. Los puntos posibles tienen que ser mayores que cero. Los puntos obtenidos no pueden superar el total salvo que la tarea esté marcada como puntos extra, y el aviso lo dice tal cual, indicándote que la marques como crédito extra si de verdad lo es.',
        ],
        bullets: [
          'Dos modos por entrega: puntos obtenidos sobre puntos posibles, o un porcentaje directo.',
          'Los puntos posibles son el total propio de la entrega, independiente de su peso en la asignatura.',
          'Los porcentajes se guardan con dos decimales; los puntos originales se conservan y se muestran al lado.',
          'Puntos obtenidos por encima de los posibles se bloquean salvo que la tarea esté marcada como crédito extra.',
          'Las entregas sin ponderación muestran un aviso visible en lugar de desviar tu promedio en silencio.',
          'Las tareas sincronizadas desde Canvas llegan con su nota ya rellenada, calculada de la misma forma.',
        ],
      },
      {
        heading: 'Qué calcula de verdad el promedio ponderado',
        paragraphs: [
          'En una asignatura donde has puesto una ponderación por entrega, Semora lleva dos totales. La ponderación total es la suma de los pesos de todas las entregas que no son crédito extra y que tienen peso, corregidas o no. La ponderación intentada es la suma de los pesos de las que ya tienen nota.',
          'Tu nota actual es la suma ponderada de tus puntuaciones dividida entre la ponderación intentada, no entre la total. Esa única decisión es la que mantiene el número honesto al principio del curso: tres entregas corregidas que cubren el 45 % de la asignatura te dan tu nota sobre ese 45 %, no una cifra hundida por el 55 % que todavía no existe.',
          'También lleva los puntos ganados, que son la suma del peso por la nota dividido entre 100: los puntos porcentuales que ya tienes asegurados de cara a la nota final. Esa cifra es de la que tira después la calculadora de pronósticos, hacia atrás.',
          'Hay un plan alternativo deliberado para el caso muy común de que el profesor nunca publique ponderaciones. Si ninguna de tus entregas corregidas lleva peso pero algunas tienen nota, Semora usa un promedio simple de las notas publicadas en lugar de negarse a mostrar nada.',
        ],
      },
      {
        heading: 'Categorías, y descartar la más baja',
        paragraphs: [
          'La mayoría de los programas no asignan un porcentaje a cada entrega concreta. Se lo asignan a un bloque: Tareas 25 %, Cuestionarios 15 %, Exámenes 45 %, Proyecto final 15 %. La pantalla de configuración de calificaciones de cada asignatura refleja esa estructura.',
          'Añades categorías con un nombre, un porcentaje de peso y un contador de cuántas notas bajas se descartan. Arriba hay un total en marcha que se queda en ámbar hasta que las categorías suman exactamente 100, momento en el que pasa a verde. Guardar está bloqueado hasta entonces.',
          'Cuando una asignatura tiene categorías, son ellas las que mandan en el cálculo. Dentro de cada una, Semora mira cómo se puntuó el trabajo: si todos los elementos contados tienen puntos obtenidos y puntos posibles, el promedio de la categoría son los puntos totales obtenidos sobre los posibles, y no la media de los porcentajes.',
          'El descarte de las más bajas se aplica por categoría, de 0 a 20, y elimina las peores por porcentaje. Tiene una regla de seguridad que conviene conocer: nunca descartará tu única nota. El número de descartes se limita a uno menos que la cantidad de elementos corregidos.',
          'Las categorías que aún no tienen nada corregido simplemente se quedan fuera del denominador. Aparecen como «Sin notas» en el desglose, y la cabecera pasa a indicar qué parte de la mezcla de categorías está informando, para que sepas sobre cuánto se está calculando.',
        ],
        bullets: [
          'Los pesos de las categorías tienen que sumar exactamente el 100 % para que la pantalla guarde.',
          'El descarte de la más baja es por categoría, de 0 a 20, y nunca quita tu última nota.',
          'Una categoría en la que todo tiene puntos se promedia por puntos totales, no por media de porcentajes.',
          'Las categorías sin trabajo corregido se excluyen de la nota en curso en lugar de contar como cero.',
          'Borrar una categoría deja sus tareas sin categoría y no elimina ninguna nota.',
          'Las asignaturas que nunca definen categorías conservan la ponderación por entrega que ya tenían.',
        ],
      },
      {
        heading: 'Tres significados distintos de «crédito extra»',
        paragraphs: [
          'El crédito extra es donde casi todas las calculadoras de notas se equivocan en silencio, porque «crédito extra» significa por lo menos tres cosas distintas según el profesor. Semora lo convierte en un ajuste por asignatura con tres opciones.',
          'Puntos de bonificación es la opción por defecto. Lo que vale el elemento extra son puntos porcentuales planos que se suman por encima de tu nota, escalados según lo bien que lo hicieras. Si tu categoría de tareas es el 10 % de la asignatura y sacas la mitad del bonus, se suma la mitad de esos puntos.',
          'Dentro de la categoría integra el elemento extra en el promedio de su categoría como una entrega más, lo que puede empujar esa categoría por encima del 100 %. Es el modelo correcto cuando tu profesor añade una pregunta de bonificación dentro de un examen.',
          'Cuando marcas una tarea como crédito extra, el campo de ponderación cambia de nombre a «Valor del crédito extra (puntos %)» con una pista que explica que ese número son puntos de bonificación añadidos por encima, escalados según tu nota. Si lo dejas en blanco, el elemento no aporta nada bajo la regla de bonificación.',
        ],
      },
      {
        heading: 'Notas con letra y la escala de calificación',
        paragraphs: [
          'Semora viene con la escala corriente: A a partir de 90, B de 80, C de 70, D de 60 y F desde 0. Para convertir un porcentaje en letra, ordena la escala de mayor a menor corte y toma el primer umbral que tu nota alcanza o supera.',
          'El escaneo puede sustituirla por la escala real de tu profesor. Cuando el programa imprime una tabla de calificación, el analizador la extrae, conserva los más y los menos si están listados, y la ordena de mayor a menor. Esa escala se aplica a la asignatura nueva.',
          'Editar la escala a mano es la línea de Pro. Las cuentas gratuitas ven una fila bloqueada de «Personalizar escala» con la etiqueta PRO que abre la pantalla de suscripción; las cuentas Pro ven la escala como fichas (A: 90 % o más, B: 80 % o más, y así) que se tocan para editarlas.',
          'La insignia de letra en la tarjeta de nota lleva color según su primera letra —verde para cualquier cosa que empiece por A, azul para B, ámbar para C, naranja para D y rojo en los demás casos— así que el color sobrevive a las etiquetas personalizadas que uses.',
        ],
      },
      {
        heading: 'La nota media estimada del semestre',
        paragraphs: [
          'La pestaña de Cursos lleva una tarjeta de cabecera con la nota media estimada del semestre, con dos decimales y una línea que explica en qué se basa: cuántas de tus asignaturas están informando de una letra y cuántos créditos corregidos representa eso.',
          'Cada asignatura tiene un campo de créditos, editable de 0,5 a 12 y con 3 por defecto. La estimación multiplica los puntos de nota de cada asignatura por sus créditos, lo suma y lo divide entre el total de créditos. Las asignaturas que aún no tienen letra se excluyen en lugar de contar como cero.',
          'La tabla de puntos por defecto es la escala estándar de 4,0: A+ y A a 4,0, A− 3,7, B+ 3,3, B 3,0, B− 2,7, C+ 2,3, C 2,0, C− 1,7, D+ 1,3, D 1,0, D− 0,7 y F 0. El emparejamiento de letras es tolerante: normaliza mayúsculas y espacios.',
          'El editor de la escala de nota media está en Configuración y es de Pro. Las cuentas gratuitas pueden abrirlo y leer la tabla, pero no editarla. Las cuentas Pro pueden fijar los puntos exactos que da su universidad a cada letra, de 0 a 10.',
        ],
      },
      {
        heading: 'Pronósticos: ¿cuánto necesito en lo que queda?',
        paragraphs: [
          'Esta es la mitad Pro del seguimiento de calificaciones, y está construida enteramente con números que ya tienes.',
          'La tarjeta de «¿Qué necesito?» toma cada letra de la escala de tu asignatura y trabaja hacia atrás. El promedio necesario es tu porcentaje objetivo por la ponderación total, menos los puntos que ya tienes asegurados, dividido entre la ponderación que sigue pendiente.',
          'El supuesto del examen final va en la otra dirección. Recupera hasta seis entregas sin corregir, dando preferencia a lo que esté tipificado como examen o lleve «final», «parcial» o «examen» en el título, y te deja tocar una nota hipotética —70, 80, 85, 90 o 100— para ver dónde caería tu nota.',
          'Las cuentas gratuitas ven la tarjeta en su sitio con el número real de lo que queda dentro, y al tocarla llegan a la pantalla de suscripción. Hay un caso idéntico en los dos planes: cuando ya está corregida toda la ponderación, ambos ven la misma línea.',
        ],
      },
      {
        heading: 'Cómo se conecta con el resto de Semora',
        paragraphs: [
          'Las calificaciones no son una pantalla aislada. Las notas que introduces alimentan el resto de la app.',
          'Tu pestaña de Cursos muestra la letra y el porcentaje de cada asignatura bajo su nombre, junto a lo siguiente que vence. Si conectas Canvas, que forma parte de Pro, las notas de las tareas llegan con sus puntos obtenidos y posibles y se convierten igual.',
          'Del lado de Pro, la revisión académica lee tu historial de notas directamente. Una asignatura necesita al menos dos elementos corregidos; Semora compara entonces el promedio de tus tres notas más recientes con el de las tres anteriores, ordenadas por cuándo se calificaron.',
          'Todo eso es una sola cuenta en iPhone, iPad y la web, sincronizada casi en tiempo real, así que una nota que introduces saliendo de clase ya está en tu portátil cuando lo abres.',
        ],
      },
      {
        heading: 'Para quién es, qué cuesta y quién debería saltárselo',
        paragraphs: [
          'El seguimiento de calificaciones con promedios ponderados está en el plan gratuito, y eso significa el motor entero: entrada por puntos o por porcentaje, ponderaciones por entrega, categorías, reglas de descarte, las tres políticas de crédito extra, letras a partir de la escala de tu asignatura y la nota media del semestre.',
          'Pro cuesta 3,99 $ al mes o 19,99 $ al año, que sale a unos 1,67 $ al mes en el plan anual. Añade editar la escala de tu asignatura, editar la escala de nota media, las dos calculadoras de supuestos, la revisión académica y el análisis del progreso.',
          'Es realmente útil si tu programa indica ponderaciones y la plataforma de tu universidad no muestra una nota ponderada en vivo, o muestra una en la que no confías. Es útil si alguna vez has reconstruido la misma hoja de cálculo en octubre.',
          'Es menos útil si tu plataforma ya publica una nota ponderada fiable que consultas a menudo y nunca te preguntas cuánto necesitas en el final. Y no es un expediente oficial: es tu estimación, construida con lo que introduces.',
        ],
      },
      {
        heading: 'Los casos incómodos',
        paragraphs: [
          'Todavía sin nada corregido. La tarjeta dice «Sin notas todavía», sin letra y sin barra, y la tarjeta de nota media te pide añadir notas al trabajo terminado para empezar a hacer seguimiento. Se muestra vacía en lugar de un cero, porque un cero sería mentira.',
          'Las categorías que no suman 100 se rechazan al guardar, con tu total actual indicado en el error. Es fricción intencionada: un conjunto de categorías que suma 87 produce una nota que está mal en silencio, de una forma que no notarías.',
          'Una nota bruta por encima de 100 se muestra como 100. El crédito extra puede llevarte por encima del tope en la aritmética bruta; lo que se muestra se recorta. Borrar una categoría deja sus tareas sin categoría y sus notas intactas.',
          'Una nota mal introducida es el caso más fácil. Tocas la puntuación y se reabre en el modo que usaste originalmente, ya rellenada con los puntos o el porcentaje que escribiste, así que corregir una errata no obliga a recalcular nada.',
        ],
        bullets: [
          'Sin trabajo corregido se muestra «Sin notas todavía» en lugar de 0 %.',
          'Los pesos de categoría que no suman 100 % bloquean el guardado, con tu total actual a la vista.',
          'El descarte de las más bajas se detiene en una nota restante por alto que lo pongas.',
          'El crédito extra sin valor en puntos no aporta nada bajo la regla de bonificación.',
          'Cualquier nota bruta por encima de 100 se muestra como 100.',
          'Editar una nota publicada la reabre rellenada en el modo de entrada que usaste al principio.',
        ],
      },
    ],
  },

  'smart-plan': {
    lede: 'El Plan Inteligente toma cada entrega pendiente que tengas y la reparte como sesiones de estudio con día y hora a lo largo de los próximos 14 días: alrededor de tus clases, dentro del presupuesto diario que fijes tú y en la duración de sesión que elijas.',
    intro: [
      'Una lista de entregas no es un plan. Te dice que un parcial del 25 % cae el día 14 y que un informe de laboratorio cae el 16. No te dice qué tarde te vas a sentar de verdad, cuánto rato ni con qué. En ese hueco es donde se pierden la mayoría de los semestres.',
      'Los dos fallos parecen distintos pero salen del mismo sitio. El primero es subestimar algo grande: un proyecto que en una lista de tareas ocupa una línea y resulta ser seis horas de trabajo que no se comprimen en la noche anterior. El segundo es repartir mal el tiempo que sí tienes.',
      'El Plan Inteligente cierra ese hueco con datos que Semora ya guarda. Lee todas las entregas pendientes de todas las asignaturas del semestre seleccionado, estima el esfuerzo que necesita cada una y coloca ese esfuerzo como sesiones con hora a lo largo de los próximos 14 días. Después se reajusta cuando cambia una fecha o te saltas una sesión.',
    ],
    sections: [
      {
        heading: 'Cómo construye el Plan Inteligente tus próximas dos semanas',
        paragraphs: [
          'El horizonte de planificación son 14 días contando desde hoy. Todo lo que ocurre dentro es un recorrido directo y repetible sobre tus datos: no hay llamada a ningún modelo ni ida y vuelta por la red en la planificación en sí, y por eso es instantánea y da siempre el mismo resultado con los mismos datos.',
          'Empieza recogiendo cada tarea pendiente del semestre seleccionado que tenga una fecha legible. Una tarea con fecha de inicio en el futuro se reserva hasta que llega ese día, así que el trabajo que aplazaste a propósito no reaparece antes de tiempo.',
          'Después avanza día a día. Se salta el día entero si tienes los fines de semana desactivados y es sábado o domingo. Si no, coloca un cursor de inicio en tu hora de comienzo entre semana o de fin de semana y va rellenando huecos hasta agotar el presupuesto del día.',
        ],
        bullets: [
          'El tiempo bloqueado incluye cada clase programada ese día de la semana, tomada de los horarios de tus asignaturas.',
          'También incluye cualquier sesión que ya completaste ese día, reservada desde su inicio hasta su fin más 10 minutos.',
          'Con «evitar conflictos de calendario» activado, incluye además los eventos del calendario del dispositivo para esa fecha, con 10 minutos de margen a cada lado.',
          'El presupuesto del día es tu capacidad diaria de estudio menos los minutos que ya completaste ese día, así que terminar antes te devuelve tiempo de verdad.',
          'Un hueco solo se usa si la sesión entera cabe antes del siguiente bloque ocupado; si no, la colocación salta por encima de ese bloque.',
          'Nunca se coloca nada de menos de 15 minutos.',
        ],
      },
      {
        heading: 'Cuánto cree que va a costar cada cosa',
        paragraphs: [
          'Cada tarea lleva un campo de esfuerzo estimado cuando la creas o la editas, con opciones de estimación automática, 30 m, 1 h, 2 h, 3 h, 4 h y 8 h. Si pones un número real de 15 minutos o más, ese número manda por encima de todo lo demás.',
          'Cuando lo dejas en estimación automática, el planificador recurre a una cifra base según el tipo de tarea: 45 minutos para una lectura, 60 para «otro», 75 para un cuestionario, 90 para una tarea, 240 para un examen y 360 para un proyecto. Esa base se multiplica después según la ponderación de la entrega.',
          'Así, un parcial que vale el 30 % de la nota se lee como 240 por 1,5, es decir seis horas de preparación repartidas entre los días que queden. Una lectura del cinco por ciento se lee como 45 minutos. Nada de esto se te oculta: cambiar el esfuerzo estimado de una tarea cambia el plan al instante.',
        ],
      },
      {
        heading: 'Qué se programa primero, y por qué',
        paragraphs: [
          'El orden es donde un planificador se gana el sueldo, porque cuando los días están llenos algo tiene que perder. Cada tarea recibe una puntuación de carga igual a su ponderación multiplicada por un factor de preparación según el tipo: 3 para un examen, 2,5 para un proyecto, 1,5 para un cuestionario, 1,2 para una tarea y 1 para una lectura.',
          'Esa puntuación se multiplica después por la prioridad (1,55 en alta, 0,78 en baja, sin cambio en normal) y se divide entre lo lejos que queda la fecha, con un suelo para que algo que vence hoy no divida entre cero. El resultado es un orden que sube lo pesado y lo cercano.',
          'Dentro de un mismo día, cada tarea acumula una parte de su trabajo restante igual a los minutos que le faltan divididos entre los días disponibles, redondeado hacia abajo a múltiplos de 15 minutos. Un proyecto de 8 horas que vence en 10 días aparece por tanto en trozos manejables en lugar de un bloque imposible.',
        ],
      },
      {
        heading: 'Los ajustes que controlas de verdad',
        paragraphs: [
          'Las preferencias del plan viven en un panel plegable arriba de la pantalla, y la cabecera muestra siempre los valores actuales en abreviado —algo como «90 m/día · sesiones de 45 m»— para que veas de un vistazo la forma de tu semana.',
          'Guardar ejecuta una sola acción de «Guardar y regenerar el plan»: las preferencias se escriben y el plan se rehace a la vez, así que nunca guardas un ajuste y te quedas con la duda de si ha surtido efecto. Estas preferencias viven en tu cuenta, no en el dispositivo.',
        ],
        bullets: [
          'Capacidad diaria de estudio: 1 h, 1 h 30 m, 2 h o 3 h. Por defecto 1 h 30 m.',
          'Duración de la sesión de concentración: 25, 45 o 50 minutos. Por defecto 45.',
          'Hora de inicio entre semana, por defecto las 17:00, y una hora de inicio de fin de semana aparte, por defecto las 10:00.',
          'Estudiar los fines de semana, activado por defecto. Al desactivarlo, sábado y domingo se saltan por completo.',
          'Reprogramar automáticamente las sesiones perdidas, activado por defecto.',
          'Evitar conflictos de calendario, activado por defecto, con 10 minutos de margen a cada lado de cada evento.',
        ],
      },
      {
        heading: 'Cuando una fecha se mueve, o te saltas una sesión',
        paragraphs: [
          'Abrir el Plan Inteligente ES la acción de reprogramar. Se ejecuta cada vez que la pantalla recibe el foco, no solo la primera vez que abres la app, así que volver después de tres días siempre produce un plan construido para hoy.',
          'Una sesión cuenta como perdida cuando sigue sin terminar y está fechada antes de hoy, o fechada hoy a una hora de inicio que ya pasó. La regeneración descarta todas las sesiones abiertas del semestre y las vuelve a colocar.',
          'Esa combinación es lo que hace que regenerar sea seguro una y otra vez. Es determinista y nunca cuenta dos veces, así que abrir la pantalla cinco veces en una tarde no te duplica la semana cinco veces.',
          'Si prefieres que el plan se quede quieto, desactiva la reprogramación automática. La pantalla te avisa de que está desactivada, y el botón de actualizar de arriba a la derecha pasa a ser lo único que lo regenera.',
        ],
      },
      {
        heading: 'De un plan a trabajo de verdad',
        paragraphs: [
          'Las sesiones se agrupan por día con etiquetas humanas (Hoy, Mañana, y después el día de la semana con su fecha) y cada cabecera de día lleva el total de ese día. Solo se listan hoy y los días futuros; el plan de ayer no es algo sobre lo que puedas actuar.',
          'Cada fila tiene tres acciones. El círculo de la izquierda marca la sesión como completada. Tocar la fila abre la tarea que hay debajo, para que puedas leer la descripción o editar la fecha que generó la sesión.',
          'Sobre la lista, una barra de resumen muestra tres números en vivo: sesiones por delante, tiempo total planificado que sigue pendiente y cuánto llevas terminado hoy. Es un detalle pequeño, pero marca la diferencia entre un plan que miras y un plan que usas.',
        ],
      },
      {
        heading: 'La carga académica, que son los mismos datos vistos de lejos',
        paragraphs: [
          'El Plan Inteligente se ocupa de los próximos 14 días. La carga académica, también incluida en Pro, se ocupa del semestre, y sinceramente es la más útil de las dos en la primera semana de curso, cuando todavía no hay nada urgente.',
          'El gráfico semanal reparte cada entrega pendiente en semanas ISO entre las fechas de inicio y fin de tu semestre, o el rango de tus propias fechas cuando el semestre no las trae. Cada barra es la suma de las mismas puntuaciones de carga ponderada.',
        ],
        bullets: [
          'Un aviso de semana cargada nombra la próxima, cuenta las entregas que se acumulan en ella y te dice cuántas semanas cargadas quedan.',
          'Una franja de densidad de exámenes lista solo las semanas que contienen examen, de la más cercana a la más lejana, con el recuento por semana.',
          'La carga por asignatura ordena de más pesada a menos y muestra el número de pendientes y el porcentaje de la nota que sigue en juego.',
          'La cabecera muestra el nombre del semestre y cuántas semanas quedan.',
          'Una lista corta ordena tus tres tareas más apremiantes en «hazlo ahora», «viene pronto» y «planifica», con enlace directo a cada una.',
        ],
      },
      {
        heading: 'Para quién es de verdad, y para quién no',
        paragraphs: [
          'El Plan Inteligente está pensado para un estudiante con tres asignaturas o más con programas ponderados de verdad, donde al menos una tenga un proyecto de varias semanas o un examen pesado y las fechas estén lo bastante juntas como para que el orden importe.',
          'Te vale menos si llevas una asignatura con dos entregas: el problema de ordenación que estarías pagando por resolver todavía no existe. También encaja mal si lo que quieres es un horario fijo e inamovible, porque este se reajusta a propósito.',
          'Un límite que conviene decir claro: la consulta del calendario que hace el planificador es de solo lectura y solo en iOS. Nunca crea, edita ni borra un evento en tu calendario. Escribir tu horario en la app de calendario, y la exportación .ics, son cosas aparte.',
        ],
      },
      {
        heading: 'Los casos incómodos',
        paragraphs: [
          'No tener horas suficientes es el más común, y se muestra en lugar de esconderse. Si el trabajo que vence dentro de la ventana de 14 días no cabe en tu capacidad, un aviso ámbar dice exactamente cuánto tiempo se queda sin programar.',
          'El trabajo atrasado no se descarta. Una tarea pasada de fecha apunta todo su esfuerzo restante a hoy en lugar de desaparecer del plan. Una tarea que vence hoy más tarde conserva sus sesiones antes de esa hora.',
          'Los datos malos se contienen en vez de romper nada. Una clase con hora de fin ausente o absurda se trata como una hora. Una fecha importada muy lejana se limita a un margen de 120 días para el reparto, así que una errata no puede aplastar el plan.',
          'El acceso al calendario se gestiona en silencio. Las actualizaciones automáticas nunca piden permiso; solo guardar tus ajustes puede pedirlo. Si deniegas el permiso, o estás en la web donde la consulta no existe, el plan se construye igual sin ese dato.',
          'Por último, el guardado se valida en el servidor. Las sesiones tienen que estar entre 15 y 180 minutos, cada tarea tiene que ser tuya y seguir pendiente, y el semestre tiene que pertenecerte.',
        ],
      },
    ],
  },

  'flashcards': {
    lede: 'Semora convierte una asignatura que ya escaneaste en un mazo de tarjetas de estudio, y después programa cada tarjeta para que vuelva justo antes de que se te fuera a olvidar.',
    intro: [
      'Hacer tarjetas es la parte que todo el mundo se salta. Tienes tres exámenes en nueve días, un programa que leíste una vez en la primera semana y una carpeta de diapositivas que no has vuelto a abrir. Construir sesenta tarjetas a mano es exactamente el trabajo que no vas a hacer la noche antes.',
      'Semora ya tiene el material. Cuando escaneaste el programa, el analizador guardó una lista estructurada de todos los temas y elementos que encontró. Si subiste diapositivas o una lectura para el Tutor con IA, eso también está guardado.',
      'Esta página recorre lo que pasa de verdad cuando tocas «Generar con IA», qué le hace el programador a cada tarjeta cuando la calificas, y dónde se detiene la función. Números reales, etiquetas reales de botones.',
    ],
    sections: [
      {
        heading: 'Cómo se genera un mazo, paso a paso',
        paragraphs: [
          'La generación se ancla en una asignatura, así que empieza en una asignatura. Abre un curso, baja hasta la tarjeta de herramientas de estudio y toca la fila de tarjetas de estudio. Esa fila lleva la asignatura consigo.',
          'Toca «Generar con IA» y el botón se despliega en un panel con dos decisiones y una confirmación. Primero, en qué centrarse: la asignatura entera o un elemento concreto de los que ya sigues. Segundo, el material de estudio.',
          'Detrás de ese toque, la petición va a una función del servidor que comprueba tres cosas antes de gastar nada: que tu sesión es válida, que tu cuenta es Pro y que la asignatura es tuya.',
        ],
        bullets: [
          'El análisis más reciente de esa asignatura: hasta 60 elementos extraídos del programa, cada uno con su título y su tipo.',
          'Hasta los 10 archivos de apuntes subidos más recientemente para esa asignatura, compartiendo un presupuesto combinado de 24.000 caracteres.',
          'Cuando acotas el mazo a un elemento, una lista de «lo ya cubierto» construida a partir de las demás tareas de la asignatura.',
          'Nada más. Los horarios de clase y de atención no se envían nunca, porque no se pueden preguntar.',
        ],
      },
      {
        heading: 'Centra el mazo en toda la asignatura o en un examen concreto',
        paragraphs: [
          'La fila de enfoque es un conjunto de fichas. La primera es «Asignatura completa» y viene seleccionada por defecto. Después viene una ficha por cada examen, cuestionario, tarea y lectura que Semora ya esté siguiendo.',
          'Esas fichas salen de tus tareas en vivo, no del resultado original del escaneo. Esa distinción importa más de lo que parece: si el escaneo leyó mal una fecha y tú la corregiste, o renombraste algo, las fichas reflejan tu versión.',
          'Elegir un elemento concreto hace algo más cuidadoso que añadir «céntrate en el parcial» a una instrucción. El servidor mira todas las demás tareas de esa asignatura y las separa por fecha real, para que un repaso de parcial no se diluya con materia del final.',
          'Si una asignatura todavía no tiene exámenes, cuestionarios, tareas ni lecturas registradas, el panel lo dice tal cual y sugiere añadir uno para poder centrar la generación. «Asignatura completa» sigue funcionando igual.',
        ],
      },
      {
        heading: 'Adjunta el dosier de repaso que repartió tu profesor',
        paragraphs: [
          'Bajo «Material de estudio» hay una fila punteada que dice «Añade un PDF o una foto (por ejemplo, el dosier de repaso del profesor)». Al tocarla se abre el selector de archivos, limitado a PDF e imágenes.',
          'El archivo va a un espacio de almacenamiento privado, archivado bajo tu propio identificador de usuario y con el nombre saneado para la ruta. En tu móvil no se analiza nada.',
          'Son los mismos apuntes de la asignatura que usa el Tutor con IA. Sube aquí un dosier y el Tutor puede responder desde él; sube diapositivas en el Tutor y la generación de tarjetas las recoge. Es un único material compartido.',
        ],
      },
      {
        heading: 'Qué escribe el generador, y qué deja fuera',
        paragraphs: [
          'La instrucción de generación es concreta sobre qué cuenta como tarjeta. Pide contenido académico: conceptos, términos, definiciones, fórmulas y hechos clave sacados de los temas del programa y de tus apuntes.',
          'La forma también está fijada. El anverso es una pregunta corta o un término. El reverso es una respuesta o definición concisa, de una a tres frases. El objetivo está entre 10 y 20 tarjetas.',
          'Lo que vuelve se valida antes de guardar nada. Las dos caras se recortan, cada una con un tope de 300 caracteres. Cualquier entrada a la que le falte el anverso o el reverso se descarta en lugar de tumbar el lote entero.',
          'El mazo se crea en el momento y se nombra según lo que pediste: «Química Orgánica I — Parcial 2» cuando lo acotas a un elemento, o «Química Orgánica I — Generado con IA» para la asignatura completa.',
        ],
      },
      {
        heading: 'El calendario: qué hacen de verdad Otra vez, Difícil, Bien y Fácil',
        paragraphs: [
          'Cada tarjeta lleva cuatro números: un factor de facilidad, un intervalo en días, una fecha de repaso y un recuento de aciertos consecutivos. Una tarjeta nueva empieza con facilidad 2,5, intervalo 0, para repasar ya y cero aciertos.',
          'Cuando calificas una tarjeta revelada, Semora ejecuta una variante compacta de SM-2 y escribe el siguiente estado. Los cuatro botones no son decorativos: cada uno mueve la facilidad y el intervalo de forma distinta.',
          'La facilidad está limitada a un mínimo de 1,3, el suelo de SM-2, tanto en el programador como por una restricción en la base de datos, así que una mala semana de «otra vez» y «difícil» no puede meter una tarjeta en un bucle permanente.',
          'En la práctica, una tarjeta que sigues acertando va a 1 día, luego 6, luego 15, luego unos 38 y después alrededor de tres meses. Una tarjeta que sigues fallando se queda delante de ti.',
        ],
        bullets: [
          'Otra vez: la facilidad baja 0,20, el recuento de aciertos vuelve a cero y la tarjeta vuelve enseguida.',
          'Difícil: la facilidad baja 0,15. Una tarjeta nueva pasa a 1 día; una asentada recibe su intervalo actual con un aumento pequeño.',
          'Bien: la escalera estándar. El primer acierto es 1 día, el segundo 6 días, y a partir de ahí el intervalo se multiplica por la facilidad.',
          'Fácil: la facilidad sube 0,15 y el intervalo se multiplica por esa facilidad y después por un extra de 1,3.',
        ],
      },
      {
        heading: 'Una sesión de estudio, de principio a fin',
        paragraphs: [
          'Tu lista de mazos muestra todos los mazos agrupados por asignatura, con el icono y el color de esa asignatura, y un grupo «Sin categoría» al final para los mazos que no dependen de ninguna.',
          'Abre un mazo y el botón de arriba dice «Estudiar 12 pendientes» o, cuando no hay nada listo, un «Nada pendiente ahora mismo» que no se puede tocar. Ese segundo estado es la función haciendo su trabajo.',
          'Al empezar una sesión, la cola de pendientes se congela en ese momento. Calificar una tarjeta empuja su fecha hacia el futuro, y sin esa foto fija la lista se reordenaría bajo tus pies a mitad de sesión.',
          'Las calificaciones se guardan en segundo plano para que la siguiente tarjeta aparezca al instante. Si una escritura falla —mala cobertura en el autobús, por ejemplo— la tarjeta simplemente sigue pendiente para tu próxima sesión.',
        ],
      },
      {
        heading: 'Tarjetas que escribes tú',
        paragraphs: [
          'Generar es opcional. «Nuevo mazo» crea uno vacío con un título de hasta 80 caracteres, asociado a la asignatura desde la que llegaste o sin categoría si abriste las tarjetas por su cuenta.',
          'Todas las tarjetas se comportan igual venga de donde venga. Toca cualquier tarjeta de la lista para editar su anverso y su reverso. El icono de papelera borra una tarjeta tras una confirmación.',
          'Una diferencia que conviene conocer: el tope de 300 caracteres por cara se aplica a las tarjetas generadas, como protección frente a la salida del modelo. Las que escribes tú no se recortan.',
        ],
      },
      {
        heading: 'Cómo se conectan las tarjetas con el resto de Semora',
        paragraphs: [
          'Las tarjetas van por detrás del escáner. El programa que escaneaste es la fuente de anclaje, las tareas que Semora extrajo se convierten en las fichas de enfoque, y los apuntes que adjuntaste alimentan tanto la generación como el Tutor.',
          'Las tarjetas forman parte de Pro, por 3,99 $ al mes o 19,99 $ al año, que sale a unos 1,67 $ al mes en el plan anual. Pro se compra en la app de iOS y la suscripción se aplica a toda la cuenta.',
        ],
      },
      {
        heading: 'Para quién es, para quién no, y qué pasa cuando algo falla',
        paragraphs: [
          'Encaja en asignaturas donde la carga es de memoria: biología introductoria, anatomía, terminología de psicología, reacciones de química orgánica, vocabulario de idiomas, fechas de historia o nombres de leyes en derecho.',
          'Encaja peor donde el trabajo consiste en producir algo en lugar de recuperarlo. Matemáticas con muchas demostraciones, una asignatura de taller, un proyecto de programación de todo el semestre o un seminario que se califica con tres ensayos.',
          'La generación también tiene un requisito duro: algo que leer. Si una asignatura no tiene ni programa escaneado ni apuntes subidos, la generación se detiene antes de costar nada y te lo dice.',
          'Los demás caminos de fallo son concretos y conviene reconocerlos.',
        ],
        bullets: [
          'El modelo responde ocupado o limitado: Semora reintenta hasta tres veces antes de rendirse.',
          'La respuesta se corta a mitad de lote: se te dice que se generó más de lo que cabe y que reintentar suele funcionar.',
          'La salida viene mal formada: no se guarda nada y simplemente se te pide que lo intentes de nuevo.',
          'Un archivo de apuntes falla al extraerse: ese archivo se salta y la generación continúa con lo demás.',
          'La comprobación de la suscripción falla: recibes una respuesta de no disponible temporalmente en lugar de que se te trate como cuenta gratuita en silencio.',
        ],
      },
    ],
  },

  'focus-timer': {
    lede: 'Un temporizador tipo Pomodoro dentro de la app que ya conoce tus fechas de entrega. Eliges una duración, enlazas el bloque con una tarea o una sesión planificada, y recibes un aviso en cuanto termina.',
    intro: [
      'Un horario universitario no es una fila de tardes libres. Es un hueco de 50 minutos antes de la siguiente clase, veinte minutos en el autobús, una hora en la biblioteca que se interrumpe dos veces. Casi todos los consejos de estudio dan por hecho un bloque despejado que tú no tienes.',
      'El temporizador de concentración de Semora es una cuenta atrás tipo Pomodoro integrada en la app que ya guarda tu programa, tus entregas y tu plan de estudio. Eso importa más de lo que parece: un temporizador independiente no sabe qué deberías estar haciendo.',
      'Esta página describe exactamente qué hace la función, con el nivel de detalle que querrías antes de pagar por ella. Es una pantalla deliberadamente pequeña: cuatro duraciones de concentración, tres de descanso y una cuenta atrás.',
    ],
    sections: [
      {
        heading: 'Qué ves al abrirlo',
        paragraphs: [
          'La pantalla es una sola columna y cabe en un móvil casi sin desplazarse. Arriba, una etiqueta te dice en qué fase estás: CONCENTRACIÓN con un icono de diana, o DESCANSO con una taza.',
          'Debajo está la tarjeta de la cuenta atrás: un temporizador grande en mm:ss con cifras de ancho fijo para que los dígitos no bailen al pasar, y una barra de progreso que se va llenando a lo ancho de la tarjeta.',
          'Bajo la tarjeta hay dos controles. El botón principal es Pausar mientras un bloque está en marcha, y el resto del tiempo dice Empezar concentración, Empezar descanso o Reanudar, según la fase.',
        ],
        bullets: [
          'Una etiqueta de fase que dice CONCENTRACIÓN o DESCANSO, con color coral y verde azulado.',
          'Una cuenta atrás grande en mm:ss con cifras de ancho fijo, más una barra de progreso de la fase actual.',
          'Un recuento en vivo de bloques completados en esta sentada, con el total histórico al lado.',
          'Pausar, o Empezar concentración / Empezar descanso / Reanudar, más un Reiniciar que te devuelve a un bloque nuevo.',
          'Selectores de duración de concentración y de descanso, visibles solo con el temporizador parado.',
          'Un aviso fijo de que el temporizador sigue corriendo en segundo plano y te avisará al terminar la fase.',
        ],
      },
      {
        heading: 'Las cuatro duraciones de concentración y las tres de descanso',
        paragraphs: [
          'El selector de concentración ofrece 15, 25, 45 y 50 minutos. El de descanso ofrece 5, 10 y 15. Una sesión nueva se abre con la pareja Pomodoro clásica de 25 y 5.',
          'Esos números se eligieron contra un horario universitario y no contra una jornada de oficina. Quince minutos es lo que te deja un hueco real entre clases una vez has cruzado el campus.',
          'Los dos selectores desaparecen en cuanto un bloque arranca. Es intencionado: un temporizador que te deja alargar una fase a mitad es un temporizador que te deja negociar contigo mismo.',
          'Una consecuencia que conviene saber: cambiar una duración con el temporizador en pausa reinicia el reloj de esa fase a la nueva duración completa. Si llevas 12 minutos de un bloque de 25, pausas y tocas 45, empiezas de nuevo con 45.',
        ],
        bullets: [
          'Concentración: 15, 25, 45 o 50 minutos.',
          'Descanso: 5, 10 o 15 minutos.',
          'Por defecto: un bloque de concentración de 25 minutos y un descanso de 5.',
          'Los selectores se ocultan mientras un bloque corre, así que nada se puede alargar a mitad de cuenta atrás.',
          'Cambiar una duración en pausa reinicia esa fase con la nueva duración completa.',
        ],
      },
      {
        heading: 'Arrancar un bloque desde una tarea o una sesión planificada',
        paragraphs: [
          'Hay cuatro vías de entrada. La pestaña Mi cuenta lista el temporizador entre las herramientas académicas; la app web lo lista en la barra lateral con el mismo nombre; la pantalla de detalle de una tarea tiene un botón para empezar una sesión de concentración.',
          'Las dos últimas son las que merece la pena usar. Abrir el temporizador desde una tarea pasa el identificador y el título de esa tarea, y la pantalla muestra una banda enlazada arriba con el nombre de lo que estás trabajando.',
          'Abrirlo desde una sesión del Plan Inteligente pasa algo más: la duración propia de ese bloque y su identificador. Si esa duración no es una de las cuatro estándar, se respeta igualmente.',
          'Terminar un bloque de concentración que venía de una sesión planificada marca esa sesión exacta como completada en tu Plan Inteligente, que es el único registro duradero que el temporizador escribe en algún sitio.',
        ],
      },
      {
        heading: 'Qué pasa cuando la cuenta atrás llega a cero',
        paragraphs: [
          'Pasan dos cosas, y son independientes entre sí a propósito.',
          'La primera es una notificación. Al pulsar empezar, Semora programa con el sistema operativo un aviso real con fecha para el momento exacto en que acaba la fase, con sonido.',
          'La segunda es lo que ocurre en pantalla. El temporizador avanza a la fase siguiente (concentración pasa a descanso, descanso pasa a concentración) y se detiene ahí, en pausa, con la nueva duración completa en el reloj.',
          'Solo una fase de concentración completada cuenta para algo. Incrementa el recuento de esta sentada, incrementa el total histórico y marca como completada la sesión enlazada del Plan Inteligente.',
        ],
      },
      {
        heading: 'Salir de la app a mitad de bloque, y por qué el reloj sigue siendo honesto',
        paragraphs: [
          'Casi todos los temporizadores ingenuos guardan un número de segundos restantes y le restan uno cada segundo. Eso se rompe en cuanto cambias de app, porque los temporizadores en segundo plano se frenan o se suspenden.',
          'Semora guarda la marca de tiempo en la que acaba la fase y recalcula el tiempo restante desde el reloj actual dos veces por segundo mientras corre. El tiempo mostrado es por tanto correcto sin importar cuánto rato estuviste fuera.',
          'La sesión en marcha se escribe en el almacenamiento seguro del dispositivo, así que sobrevive a más que a un cambio de app. Cierra la app a la fuerza a mitad de bloque, vuelve a abrirla y estarás mirando el mismo bloque.',
          'Pausar cancela la notificación programada para que no pueda sonar por un bloque que detuviste, y congela el tiempo restante exacto. Reanudar programa un aviso nuevo para la nueva hora de fin.',
        ],
      },
      {
        heading: 'Qué se cuenta y qué no',
        paragraphs: [
          'Se llevan dos números. El recuento de la sentada son los bloques de concentración completados desde tu último reinicio, y es lo que mueve la línea de «3 bloques hechos».',
          'Conviene ser claro con el segundo número: es un contador local en un dispositivo, no una estadística de la cuenta. No viaja a tus otros dispositivos ni a la web como sí lo hacen tus asignaturas.',
          'Más allá de esos dos contadores, el temporizador no guarda historial. No hay registro de sesiones concretas, ni gráfico de horas por asignatura, ni informe semanal de concentración.',
        ],
      },
      {
        heading: 'Gratis frente a Pro',
        paragraphs: [
          'El temporizador de concentración es una función de Pro por completo. Las cuentas gratuitas que lo tocan ven una pantalla de presentación con el icono, una descripción corta y un botón hacia la suscripción, en lugar de una versión recortada.',
          'Conviene decirlo claro, porque casi todo el núcleo de Semora es gratis y seguirá siéndolo. En una cuenta gratuita tienes cinco escaneos de programa por mes natural, hasta cuatro asignaturas por semestre, entregas y tareas, promedios ponderados y recordatorios el mismo día.',
          'Pro cuesta 3,99 $ al mes o 19,99 $ al año, que sale a unos 1,67 $ al mes en el plan anual. Se compra dentro de la app de iOS y la suscripción se aplica a toda tu cuenta, la web incluida.',
        ],
        bullets: [
          'Gratis: 5 escaneos por mes natural, 4 asignaturas por semestre, entregas y tareas, promedios ponderados y recordatorios el mismo día.',
          'Pro: 3,99 $ al mes o 19,99 $ al año, unos 1,67 $ al mes en el plan anual.',
          'Pro se compra en la app de iOS y se aplica a toda la cuenta, incluida la web.',
          'Las cuentas gratuitas ven una presentación del temporizador con enlace a la suscripción, no una versión reducida.',
        ],
      },
      {
        heading: 'Cómo encaja un bloque de concentración en el resto de Semora',
        paragraphs: [
          'El temporizador es el último paso de una cadena que construye el resto de la app. Tu programa se escanea y se convierte en entregas reales. El Plan Inteligente toma esas entregas y reparte sesiones de estudio a lo largo de los días.',
          'Los números encajan a propósito. El ajuste de duración de sesión del Plan Inteligente ofrece 25, 45 o 50 minutos y viene con 45 por defecto: tres de las cuatro duraciones del selector de concentración.',
          'Lo que hagas dentro del bloque es trabajo del resto de Semora. Las tarjetas pueden generar un mazo para un examen concreto a partir del programa y de los apuntes que hayas subido.',
        ],
      },
      {
        heading: 'Para quién es, para quién no, y las asperezas',
        paragraphs: [
          'Es para ti si tu problema es empezar. Una duración con nombre y una tarea enlazada le quitan la negociación al principio de una sesión, y 15 minutos sobre un trabajo concreto es un compromiso mucho más fácil de aceptar.',
          'No es para ti si quieres una implementación estricta de Pomodoro. No hay descanso largo automático después de cuatro ciclos, ni avance forzado de una fase a la siguiente.',
          'Algunas asperezas que conviene conocer antes de depender de él. En el navegador el temporizador corre mientras la pestaña está abierta, pero la notificación de fin de fase y la sesión guardada son solo nativas.',
        ],
        bullets: [
          'Sin descanso largo automático tras cuatro ciclos, y sin avance forzado entre fases.',
          'Sin bloqueo de apps, bloqueo de webs ni sonido ambiente integrado.',
          'Sin totales de tiempo por asignatura, historial de sesiones ni informe semanal.',
          'En la web, sin notificación de fin de fase y sin sesión guardada tras recargar.',
          'Un permiso de notificaciones denegado se omite en silencio; la cuenta atrás no se ve afectada.',
        ],
      },
    ],
  },

  'ai-tutor': {
    lede: 'Pregunta sobre tu asignatura y recibe una respuesta construida desde tu propio programa, tus entregas en vivo y los apuntes que subiste, no desde una búsqueda genérica.',
    intro: [
      'Es martes. Tienes una serie de problemas que entregar, una lectura que leíste en diagonal y una duda sobre la diferencia entre dos ideas que tu profesor trató como obvias. Podrías buscarlo y recibir una explicación general que no sabe nada de tu asignatura.',
      'Los chatbots generales explican conceptos bien y conocen tu situación fatal. No saben que tu profesor dijo que el parcial cubre los capítulos del uno al seis y no el siete. No saben qué has entregado ya.',
      'El Tutor con IA de Semora es la misma clase de modelo haciendo un trabajo más estrecho. Antes de ver tu pregunta, el servidor arma un paquete con tu material real: lo que sacó el escaneo de tu programa, tus entregas y los apuntes que hayas subido.',
    ],
    sections: [
      {
        heading: 'Qué se le entrega al Tutor antes de que responda',
        paragraphs: [
          'Cada mensaje que envías dispara una construcción de contexto nueva en el servidor. No hay nada precalculado de la semana pasada: el Tutor ve tu asignatura tal y como está en el momento en que pulsas enviar.',
          'El primero es el bloque de programa y asignatura. Lleva el nombre del curso, el profesor si lo registraste, y tus clases escritas como líneas del tipo «teoría: lunes 10:00-10:50, aula 210».',
          'El segundo bloque son las entregas, construido a partir de las tareas que sigues de verdad en esa asignatura, ordenadas por fecha, con lo completado marcado como hecho y con sus ponderaciones y horas.',
          'El tercero son los apuntes: el texto extraído de los archivos adjuntos a la asignatura, cada uno encabezado por su nombre de archivo para que el Tutor pueda decirte de qué documento salió algo.',
        ],
        bullets: [
          'El bloque de programa está limitado a 8.000 caracteres y lleva hasta 60 elementos de tu último escaneo.',
          'El bloque de entregas está limitado a 8.000 caracteres y hasta 60 tareas.',
          'Los apuntes se leen del más reciente al más antiguo: los 10 últimos archivos de esa asignatura, compartiendo un presupuesto de 24.000 caracteres.',
          'Un bloque que haya tenido que recortarse se marca explícitamente como truncado, para que el modelo lo sepa.',
          'Los últimos 12 mensajes de tu conversación se reproducen en cada turno para dar continuidad.',
          'Cuando no hay ningún material de la asignatura, al modelo se le dice directamente y se le pide que te invite a añadirlo.',
        ],
      },
      {
        heading: 'Cómo viaja de verdad un mensaje',
        paragraphs: [
          'La pantalla es un chat normal. Escribes, pulsas la flecha, tu mensaje aparece como burbuja al instante mientras la petición va en camino, normalmente entre tres y diez segundos.',
          'La llamada al modelo va a OpenAI GPT-5.6 Luna con razonamiento bajo y un techo de salida de 2.048 tokens: suficiente para una explicación trabajada sin invitar a un ensayo.',
        ],
        bullets: [
          'La petición tiene que declarar su tamaño, y el cuerpo tiene que estar por debajo de 256 KB.',
          'Tu sesión se valida y después se consulta a la base de datos si eres Pro. Es una comprobación del servidor, no del cliente.',
          'Se reserva un mensaje de tu asignación diaria, de forma atómica y bajo un bloqueo por usuario.',
          'Se confirma que la conversación es tuya y se lee de ella la asignatura sobre la que anclar.',
          'Se construyen los tres bloques de contexto, se reproducen los turnos recientes y se añade tu mensaje nuevo.',
          'Los dos turnos —tu mensaje y la respuesta— se escriben en la base de datos desde el servidor, así que tu historial no depende del dispositivo.',
        ],
      },
      {
        heading: 'Las respuestas sobre fechas salen de tu lista de tareas, no de la memoria del modelo',
        paragraphs: [
          'Una línea de las instrucciones del Tutor no es una preferencia. Si preguntas por entregas o fechas, tiene que responder desde la sección de entregas, y no puede inventarse una fecha nunca.',
          'Eso importa más de lo que parece. El bloque de entregas se construye desde tu lista de tareas en vivo, no desde el texto en bruto del PDF del programa. Si tu profesor retrasó el ensayo y tú lo actualizaste, el Tutor responde con tu fecha.',
          'Hay un límite correspondiente que conviene decir claro. El bloque de entregas lleva títulos, tipos, fechas, horas, ponderaciones y si has marcado algo como hecho. No lleva tus notas.',
        ],
      },
      {
        heading: 'Subir apuntes de clase',
        paragraphs: [
          'Toca «Añadir apuntes» en la barra sobre la conversación y elige un archivo. El selector acepta PDF e imágenes, así que unas diapositivas exportadas, una lectura escaneada o una foto de la pizarra valen.',
          'Tu dispositivo no analiza nada. Sube el archivo en bruto a un almacenamiento privado bajo una ruta ligada a tu cuenta y guarda un puntero. La primera vez que el Tutor lo necesita, se extrae el texto en el servidor.',
          'Los archivos subidos aparecen como fichas que puedes tocar para quitar. La confirmación dice exactamente qué significa quitarlo: ese archivo dejará de anclar al Tutor.',
          'Dos restricciones que conviene saber de entrada. Los apuntes se adjuntan a una asignatura, así que si abriste el Tutor sin una, la app te pide que lo abras desde una asignatura primero.',
        ],
      },
      {
        heading: 'Un hilo por asignatura, más uno general',
        paragraphs: [
          'No hay una lista de hilos que gestionar. Abre el Tutor desde una asignatura y caes en la conversación continua de esa asignatura, el mismo hilo en el que estabas la semana pasada, con el historial intacto.',
          'Ábrelo desde la pestaña Mi cuenta y tendrás un hilo general sin asignatura asociada. Eso también funciona, pero el servidor le dice al modelo directamente que no hay material de asignatura disponible.',
          'El acotado es también lo que impide que las asignaturas se mezclen. Tu hilo de química orgánica está anclado en el programa, las tareas y los apuntes de química orgánica, y en nada más.',
        ],
      },
      {
        heading: 'Los límites, en números reales',
        paragraphs: [
          'El tope diario se aplica aunque el Tutor sea una función de Pro. Existe para acotar lo que cuesta ejecutar el modelo, y vive en el servidor para poder ajustarse sin publicar una versión nueva.',
        ],
        bullets: [
          '50 mensajes al Tutor por cada 24 horas móviles y por cuenta. Móviles, no un reinicio a medianoche.',
          '4.000 caracteres por mensaje, controlados en el compositor y comprobados otra vez en el servidor.',
          'Tamaño máximo de petición: 256 KB.',
          '60 elementos de programa y 60 tareas por construcción de contexto.',
          '10 archivos de apuntes por asignatura en el anclaje, compartiendo 24.000 caracteres de texto extraído.',
          '12 mensajes anteriores reproducidos por turno, aproximadamente seis intercambios de memoria de trabajo.',
          '2.048 tokens de salida por respuesta.',
        ],
      },
      {
        heading: 'Cómo se conecta con el resto de Semora',
        paragraphs: [
          'El Tutor no guarda copia de nada. Lee los mismos registros que escribe el resto de la app, y por eso importa el orden en que haces las cosas.',
          'Conviene ser igual de claro con lo que no toca. No lee tu horario de atención, ni tus notas introducidas, ni tu Plan Inteligente, ni tus otras asignaturas.',
        ],
        bullets: [
          'El escaneo de tu programa rellena los elementos estructurados que el Tutor te cita de vuelta.',
          'Los cambios que hagas en una entrega desde cualquier parte de la app cambian lo que el Tutor dice la próxima vez que preguntes.',
          'Los apuntes subidos aquí son los mismos que lee la generación de tarjetas, compartiendo una única transcripción.',
          'Los horarios de clase y tu escala de calificación propia, ambos definidos en la asignatura, entran en el contexto del Tutor.',
          'Pro se compra en la app de iOS y la suscripción se aplica a toda la cuenta, así que el Tutor está disponible también en la web.',
        ],
      },
      {
        heading: 'Para quién es de verdad',
        paragraphs: [
          'Es para el estudiante que ya ha metido una asignatura en Semora y ahora quiere interrogarla. Con un programa escaneado, una lista de entregas y unas semanas de diapositivas, las respuestas dejan de ser genéricas.',
          'Encaja mal en cuatro situaciones, y es mejor decirlo que dejar que lo descubras después de pagar.',
        ],
        bullets: [
          'Quieres que te hagan el trabajo calificado. El Tutor tiene instrucciones de explicar el razonamiento y guiarte, no de entregarte la respuesta.',
          'Todavía no tienes nada en la app. Una asignatura vacía te da un chatbot general, que puedes conseguir gratis en otro sitio.',
          'Quieres documentos largos con formato. Las respuestas son texto plano por instrucción: párrafos cortos y listas.',
          'Estás en el plan gratuito. El Tutor es de Pro; las cuentas gratuitas ven una descripción y una ruta hacia la suscripción.',
        ],
      },
      {
        heading: 'Qué pasa cuando algo va mal',
        paragraphs: [
          'Las funciones de chat fallan de formas aburridas, y saber qué fallo estás viendo te ahorra volver a escribirlo todo.',
          'El modo de fallo que conviene vigilar tú es el silencioso. Si un archivo de apuntes era demasiado grande para extraerse, o un bloque de programa se truncó, el Tutor no imprime un aviso en la respuesta.',
        ],
        bullets: [
          'El envío falla: tu burbuja se deshace y el texto que escribiste vuelve al compositor.',
          'El modelo no devuelve nada, o un filtro de seguridad bloquea la respuesta: recibes un mensaje pidiéndote que lo reformules.',
          'Tu estado Pro caducó, o la marca en caché de la app está anticuada: el servidor lo detecta y la app te lleva a la suscripción.',
          'Un archivo de apuntes no se puede descargar ni transcribir: ese fallo no es fatal; la respuesta llega igual con el resto del material.',
          'Llegas al tope diario: el error nombra el número y te dice que lo intentes en 24 horas.',
        ],
      },
    ],
  },

  'collaboration': {
    lede: 'Un espacio de curso pone las entregas y el trabajo en grupo de una asignatura donde todo tu grupo de estudio puede verlos, actualizándose en vivo. Tus notas, tus recordatorios y tus propias marcas siguen siendo privados.',
    intro: [
      'Todos los grupos de mensajería de todas las asignaturas acaban en el mismo sitio. Alguien pregunta si el informe de laboratorio se entrega el jueves o el viernes. Tres personas responden cosas distintas. Una de ellas está mirando una versión antigua del programa.',
      'El apaño habitual es un documento compartido o una hoja de cálculo que alguien se ofrece a mantener. Funciona unas dos semanas. Después la persona que la lleva deja de actualizarla, media clase olvida que existe y las fechas vuelven a vivir en el chat.',
      'Un espacio de curso es la respuesta de Semora a eso. Una asignatura, un espacio compartido, un enlace de invitación y exactamente dos tipos de contenido compartido: las entregas que publica quien organiza el espacio y los trabajos de grupo que crea cualquiera con permiso.',
    ],
    sections: [
      {
        heading: 'Qué es en realidad un espacio de curso',
        paragraphs: [
          'Un espacio va unido a una asignatura. Llegas a la función desde la pestaña Mi cuenta, en herramientas académicas, en la fila de colaboración de clase. El panel lista todos los espacios a los que perteneces.',
          'Cuando se crea un espacio, copia el nombre y el color de la asignatura, así que se parece a la asignatura que ya sigues y no a una sala genérica. La base de datos impone un único espacio por asignatura.',
          'El espacio guarda dos tipos de contenido compartido y nada más. Las entregas compartidas son las fechas reales de la asignatura, publicadas por quien organiza desde su propia copia. Los trabajos de grupo los crea el grupo.',
        ],
      },
      {
        heading: 'Crear un espacio y enviar el enlace de invitación',
        paragraphs: [
          'En el panel, tocar una asignatura bajo «Crear un espacio de curso» lo crea y te deja dentro. Desde ahí, el botón de invitar te da un enlace a través de la hoja de compartir normal.',
          'El enlace no es un código adivinable. El servidor genera 24 bytes aleatorios y los representa como un token hexadecimal de 48 caracteres, y después lo guarda con una caducidad y un contador de usos.',
          'Quien organiza tiene una hoja de ajustes que muestra cuántos enlaces de invitación siguen vivos para ese espacio: los que no se han revocado, no han caducado y aún tienen usos disponibles.',
        ],
        bullets: [
          'Token: 24 bytes aleatorios, representados como 48 caracteres hexadecimales.',
          'Caduca 7 días después de crearse.',
          'Vale para hasta 30 incorporaciones por defecto (el esquema permite de 1 a 200).',
          'Lo crean quienes organizan y quienes editan; nunca quien solo puede ver.',
          'Revocable por quien organiza en cualquier momento: un toque anula todos los enlaces vivos del espacio.',
          'Se revoca automáticamente para todos en cuanto el espacio se archiva.',
        ],
      },
      {
        heading: 'Qué pasa cuando un compañero toca el enlace',
        paragraphs: [
          'El enlace abre Semora en una pantalla de incorporación que dice a qué está accediendo antes de que acepte: verá las entregas compartidas y los trabajos de grupo, y su nombre será visible para el resto.',
          'Si no ha iniciado sesión, la invitación no se pierde. El token se guarda en el dispositivo (llavero en iPhone y iPad, almacenamiento del navegador en la web) y se le manda a iniciar sesión.',
          'La incorporación se comprueba en el servidor, no en la app. La fila de invitación se bloquea mientras se verifica que no está revocada, que no ha caducado y que no se ha quedado sin usos.',
        ],
      },
      {
        heading: 'Los tres roles, y qué puede hacer cada uno',
        paragraphs: [
          'Hay exactamente tres roles: organiza, edita y ve. Se aplican mediante seguridad por fila en la base de datos, no solo escondiendo botones en la app, así que quien solo puede ver sigue sin poder escribir aunque manipule la petición.',
          'Quien organiza gestiona los roles desde la lista de miembros. Se puede pasar a alguien de ver a editar y al revés con un toque, y cualquier miembro puede ascender a organizar.',
          'La base de datos se niega a dejar un espacio sin nadie al mando. La última persona que organiza no puede salir, ni ser degradada, ni ser expulsada.',
        ],
        bullets: [
          'Ve: lee entregas compartidas, trabajos de grupo y la lista de miembros. No puede añadir, editar ni completar.',
          'Edita: todo lo anterior, más crear y editar trabajos de grupo y marcarlos como hechos.',
          'Organiza: todo lo anterior, más publicar las entregas de la asignatura, cambiar roles y expulsar miembros.',
          'Quien se incorpora entra como editor por defecto; quien organiza puede bajarlo a solo ver después.',
          'Solo quien organiza tiene el botón de publicar, así que en la práctica el calendario de la asignatura tiene una sola fuente de verdad.',
        ],
      },
      {
        heading: 'Qué se sincroniza con tu planificador y qué se queda privado',
        paragraphs: [
          'Publicar es deliberado. Quien organiza toca publicar y Semora copia al espacio las tareas todavía sin completar de su propia copia de la asignatura, como entregas compartidas.',
          'Del lado que recibe, sincronizar trae esas entregas compartidas y todos los trabajos de grupo a tu propio planificador como tareas normales.',
          'Una vez están en tu planificador, se comportan como cualquier otra tarea. Se aplican los recordatorios del mismo día. Si tienes Pro, alimentan el Plan Inteligente y aparecen en la carga académica.',
          'La línea entre lo compartido y lo privado se traza estrecha y se sostiene en el propio esquema. Se sincronizan tres tablas: miembros, entregas compartidas y trabajos de grupo. Tu estado de completado no.',
        ],
        bullets: [
          'Se comparte con el espacio: entregas compartidas, trabajos de grupo, y nombres y roles de los miembros.',
          'Nunca se comparte: tus notas, tu promedio ponderado y tus pronósticos.',
          'Nunca se comparte: tus horas de recordatorio, tus apuntes, tus tarjetas ni tus conversaciones con el Tutor.',
          'Nunca se comparte: qué tareas has marcado tú como hechas.',
          'Los enlaces de invitación solo los puede leer quien los creó.',
          'Tus copias sincronizadas son tareas normales: edítalas, reprográmalas o bórralas en tu planificador sin afectar a nadie.',
        ],
      },
      {
        heading: 'Cómo funciona la parte en vivo',
        paragraphs: [
          'Semora mantiene una suscripción en tiempo real a los miembros, las entregas compartidas y los trabajos de grupo del espacio, filtrada a ese espacio concreto. Cuando alguien añade un trabajo, aparece sin que nadie recargue.',
          'Hay dos suscripciones en marcha, no una. La pantalla del espacio actualiza lo que estás mirando. Una segunda, más silenciosa, corre para todos los espacios a los que perteneces.',
          'La sincronización de fondo está escrita para no molestar. Se salta cuando el dispositivo está sin conexión. No arranca una segunda sincronización para un espacio que ya se está sincronizando.',
        ],
      },
      {
        heading: 'Unirse es gratis; organizar un espacio es de Pro',
        paragraphs: [
          'Unirte al espacio de curso de un compañero es gratis y lo seguirá siendo. No necesitas Pro para aceptar una invitación, ver las entregas compartidas ni encargarte de trabajo de grupo.',
          'Organizar tu propio espacio —crearlo y llevarlo— forma parte de Pro, que cuesta 3,99 $ al mes o 19,99 $ al año, unos 1,67 $ al mes en el plan anual.',
          'En la práctica eso significa que una persona del grupo necesita Pro y el resto se une gratis. Si tu Pro caduca después, los espacios que ya organizas no desaparecen.',
        ],
      },
      {
        heading: 'Salir, expulsar, archivar, borrar',
        paragraphs: [
          'Quien edita y quien ve pueden salir de un espacio desde su pantalla. Quien organiza lo gestiona desde Ajustes: para apartarse, primero asciende a otra persona y luego archiva o borra.',
          'Quien organiza puede expulsar a otra persona desde la lista de miembros, con la misma promesa: su planificador sincronizado conserva lo que ya tenía. No hay forma de alcanzar el planificador de nadie.',
          'Quien organiza tiene dos formas de terminar un espacio. Archivar lo saca del panel de todos los miembros y revoca todas las invitaciones vivas, dejando intactos los elementos ya sincronizados.',
        ],
        bullets: [
          'Salir: solo a uno mismo; bloqueado para la última persona que organiza.',
          'Expulsar: solo quien organiza; no puedes expulsarte a ti ni a la última persona al mando.',
          'Archivar: oculta el espacio para todos y anula las invitaciones vivas; lo del planificador se queda.',
          'Borrar: destruye permanentemente las entregas compartidas y los trabajos de grupo para todos.',
          'En los cuatro casos, las tareas ya sincronizadas al planificador de cada miembro no se tocan.',
        ],
      },
      {
        heading: 'Dónde se pone incómodo, y para quién es de verdad',
        paragraphs: [
          'Los casos límite honestos. El enlace de invitación abre la app de Semora, así que un compañero que nunca la haya instalado lo tocará y no pasará nada: mándale antes a la App Store.',
          'Es realmente útil para un grupo de laboratorio que comparte calendario de entregas, un equipo de proyecto que reparte un trabajo entre cuatro personas, o un grupo de estudio al que se le escapan siempre las mismas fechas.',
          'No es la herramienta adecuada para unas cuantas cosas, y conviene decirlo. No es una app de mensajería: no hay chat, solo títulos, notas, fechas y responsables.',
        ],
      },
    ],
  },

  'canvas-sync': {
    lede: 'Conecta Canvas con un token de acceso que generas tú, elige tus asignaturas y cada tarea con fecha de entrega se convierte en una entrega registrada en Semora.',
    intro: [
      'Canvas ya sabe todas las tareas que publicaron tus profesores. Lo que no hace es decirte que tres de ellas caen en las mismas 48 horas, ni avisarte la noche anterior, ni enseñarte cómo va tu nota si entregas tarde una de ellas.',
      'Así que la mayoría acaba copiando a mano. Abres cada asignatura en Canvas, recorres la pestaña de tareas y vuelves a teclear las fechas en una agenda o en el calendario del móvil. Cuesta una hora al principio del semestre y se queda desactualizado en la segunda semana.',
      'La sincronización con Canvas es la forma de saltarse eso. Generas un token de acceso dentro de tu propia cuenta de Canvas, lo pegas en Semora una vez, eliges qué asignaturas quieres, y cada tarea con fecha entra.',
    ],
    sections: [
      {
        heading: 'Por qué un token y no un botón de «Iniciar sesión con Canvas»',
        paragraphs: [
          'Casi todas las apps que conectan con Canvas lo hacen con OAuth, el flujo en el que tocas un botón, te manda a la página de acceso de tu universidad y apruebas el permiso. Parece más limpio. El problema es que ese flujo necesita que tu institución haya registrado y aprobado la app.',
          'Eso significa que una app de Canvas basada en OAuth funciona en las universidades que ya dijeron que sí y en ninguna otra. Si la tuya no la ha aprobado, tu única opción es abrir una incidencia y esperar.',
          'Un token de acceso personal se salta todo eso. Es una credencial que te emites a ti mismo, desde los ajustes de tu propia cuenta de Canvas, con permisos que ya tienes como estudiante. No hace falta que nadie apruebe nada.',
          'La contrapartida honesta es que copias una cadena una vez en lugar de tocar un botón. Y como el token lleva los permisos de tu propia cuenta, deberías tratarlo como una contraseña.',
        ],
      },
      {
        heading: 'Cómo conseguir tu token de Canvas, paso a paso',
        paragraphs: [
          'Semora imprime estas instrucciones en la propia pantalla de conexión, así que no tienes que mantener una pestaña abierta al lado de la app. Haz esta parte en un ordenador o en el navegador del móvil.',
          'Necesitas dos cosas. La primera es la dirección web de Canvas de tu universidad, normalmente tuuniversidad.instructure.com. Semora quiere la dirección HTTPS completa y te recorta la barra final.',
          'La segunda es el token. Cuando Canvas te pida una fecha de caducidad, déjala en blanco a propósito. Si pones una, la sincronización funciona bien hasta esa fecha y después empieza a fallar en silencio.',
        ],
        bullets: [
          'Inicia sesión en Canvas desde un navegador.',
          'Abre Cuenta y después Configuración.',
          'Baja hasta «Integraciones aprobadas» y toca «+ Nuevo token de acceso».',
          'Ponle de nombre «Semora», deja la caducidad en blanco y genera el token.',
          'Copia el token y pégalo en el campo correspondiente de Semora.',
        ],
      },
      {
        heading: 'Elegir qué asignaturas entran',
        paragraphs: [
          'Toca «Buscar mis asignaturas» y Semora pide a Canvas solo tus matrículas activas. Las asignaturas abandonadas y los semestres terminados que siguen en tu cuenta de Canvas no aparecen.',
          'Todo lo que vuelve viene preseleccionado. Toca cualquier asignatura para quitarla, o usa limpiar y seleccionar todo para cambiar la lista entera de golpe. También le pones nombre a la conexión.',
          'Cada asignatura que conservas se convierte en una asignatura real de Semora, no en un espejo de solo lectura. Recibe un color de un juego rotatorio de seis, un icono de libro y un enlace permanente a su equivalente en Canvas.',
          'La importación es todo o nada. Si algo falla a mitad —un corte de red, un token rechazado— Semora borra la conexión que estaba construyendo y las asignaturas que ya había creado, en lugar de dejarte a medias.',
        ],
      },
      {
        heading: 'Qué se importa realmente de cada tarea',
        paragraphs: [
          'De cada tarea de las asignaturas que elegiste, Semora trae el registro completo y no solo un título y una fecha. Las descripciones llegan con el HTML limpiado.',
          'Semora también deduce un tipo para cada elemento para que tu calendario no sea un muro indiferenciado de «tarea». Si Canvas marca el tipo de entrega como cuestionario, se convierte en cuestionario.',
          'Esto es lo que acaba en cada tarea importada:',
        ],
        bullets: [
          'El título, y la descripción como texto legible.',
          'La fecha y la hora de entrega, convertidas al reloj local de tu dispositivo desde la marca absoluta que devuelve Canvas.',
          'Puntos posibles, tus puntos obtenidos y un porcentaje calculado a partir de los dos cuando ambos existen.',
          'Estado de entrega: si Canvas la muestra como entregada, calificada o pendiente de revisión, y cuándo se entregó.',
          'Un enlace a la propia página de la tarea en Canvas, que se abre directamente desde la tarea en Semora.',
        ],
      },
      {
        heading: 'Cómo funciona la actualización después de la primera importación',
        paragraphs: [
          'No hay ninguna tarea programada en el servidor que descargue tus datos de Canvas cada cierto tiempo, y eso es consecuencia directa de dónde vive el token: como tu credencial se guarda solo en tu dispositivo, el servidor no puede usarla por su cuenta.',
          'Así que la sincronización va guiada por el primer plano. Cuando abres Semora, y cada vez que la traes de vuelta al primer plano, comprueba cada conexión y actualiza las que lleven más de 30 minutos sin sincronizar.',
          'También puedes forzarla. Cada conexión en Ajustes tiene un botón de «Sincronizar ahora», y te informa exactamente de lo que pasó: cuántas tareas se actualizaron y cuántas se saltaron.',
          'Después de cada sincronización correcta, Semora reprograma los recordatorios de tus tareas. Esa es la parte que hace útil una fecha movida: cuando un profesor pasa un trabajo del martes al viernes, tus avisos se mueven con él.',
          'Hay una consecuencia que conviene planificar. Como el token se guarda por dispositivo, la sincronización automática solo corre donde vive ese token. Si conectas Canvas en tu iPhone, la conexión es de ese iPhone.',
        ],
      },
      {
        heading: 'Dónde se guarda tu token y qué puede hacer Semora con él',
        paragraphs: [
          'En iPhone y iPad el token va al almacén seguro del sistema, ligado a esa conexión concreta. En la web va al almacenamiento local de tu navegador bajo la misma clave.',
          'Lo que los servidores de Semora guardan sobre una conexión es deliberadamente escaso: qué proveedor es, el nombre que elegiste, la URL de tu universidad, el estado de la sincronización y la última fecha.',
          'Semora solo llama a puntos de lectura. Lista tus asignaturas y lee tareas y datos del boletín. Nunca publica, entrega, edita ni borra nada en Canvas, y la pantalla de conexión lo dice.',
          'También hay protecciones sobre la dirección que escribes. La URL tiene que ser HTTPS. Las direcciones que apuntan a localhost, a nombres .local o a rangos de red privada se rechazan de plano.',
        ],
      },
      {
        heading: 'Lo que una sincronización nunca sobrescribe',
        paragraphs: [
          'Cada tarea sincronizada se empareja por una clave compuesta: la conexión, la asignatura de Canvas y el identificador de la tarea en Canvas. Ejecutar una sincronización dos veces no crea duplicados.',
          'Tampoco se borra nada. Si una tarea desaparece de Canvas, Semora conserva la tarea junto con tu estado de completado y cualquier nota asociada.',
          'Los campos que son de Canvas se refrescan en cada pasada: título, descripción, tipo, fecha, hora y a qué asignatura pertenece. Los campos que son tuyos están protegidos, y las reglas son concretas.',
        ],
        bullets: [
          'Las notas se combinan en lugar de sustituirse. Si Canvas no devuelve puntuación, Semora conserva el número que escribiste tú.',
          'El completado es una O lógica. Si marcaste una tarea como hecha en Semora, ninguna sincronización la desmarca.',
          'Lo mismo vale para la marca de entrega tardía: una vez marcada, una sincronización posterior no la borra en silencio.',
          'Si Canvas no puede dar una marca de tiempo de entrega fiable, Semora deja la hora de completado como desconocida en lugar de inventarla.',
        ],
      },
      {
        heading: 'Blackboard y Moodle, con honestidad',
        paragraphs: [
          'Semora lista tres plataformas, y no son igual de fáciles. Canvas es la que puedes configurar tú en unos dos minutos. Las otras dos suelen implicar pedirle algo a alguien.',
          'Blackboard usa un token de acceso OAuth emitido por la universidad, y la mayoría de las instituciones exigen que un administrador apruebe el acceso de lectura antes de que exista uno que puedas pegar.',
          'Moodle necesita que tu administrador habilite los servicios web y te emita un token con permiso de lectura de asignaturas y tareas.',
          'Si tu universidad usa Canvas, empieza por ahí. Si usa Blackboard o Moodle, la expectativa honesta es que quizá tengas que preguntar en tu servicio de soporte si hay un token disponible para ti.',
        ],
      },
      {
        heading: 'Qué cuesta, para quién es y dónde se pone incómodo',
        paragraphs: [
          'Conectar una plataforma académica es una función de Pro. Pro cuesta 3,99 $ al mes o 19,99 $ al año, unos 1,67 $ al mes en el plan anual. Se compra dentro de la app de iOS.',
          'Sigues teniendo el seguimiento completo de entregas y tareas, las calificaciones con promedios ponderados, los recordatorios el mismo día, unirte al espacio de un compañero y cinco escaneos de programa al mes.',
          'La sincronización con Canvas no es para todo el mundo. Si tu profesor no publica nunca tareas en Canvas y lo deja todo en el programa, escanear el programa es el mejor camino y además es gratis.',
        ],
        bullets: [
          'Las tareas sin fecha de entrega en Canvas se saltan. Semora marca la conexión como «parcial» y te dice cuántas.',
          'Si ya creaste una asignatura escaneando su programa, importar esa misma clase desde Canvas crea una segunda.',
          'Semora no trae los nombres de los profesores de la lista de asignaturas de Canvas, así que llegan sin ese dato.',
          'Una sincronización cubre hasta 50 asignaturas de una vez, y la paginación de las tareas de cada una se detiene en un límite.',
          'No hay un interruptor por asignatura después de importar. Para cambiar cuáles se sincronizan, desconecta y vuelve a conectar.',
          'Si tu token caduca o lo revocas, la conexión muestra «se requieren credenciales» y ofrece volver a conectar.',
        ],
      },
    ],
  },
};
