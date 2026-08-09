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
};
