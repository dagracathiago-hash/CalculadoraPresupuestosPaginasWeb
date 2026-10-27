# Uso de IA en este proyecto

Este documento muestra cómo utilicé la inteligencia artificial (Claude) para construir el **Cotizador Web**. Se incluyen únicamente los dos prompts que intervinieron en el desarrollo de la página.

---

## Prompt 1 · Creación de la aplicación

Con este prompt se generó la aplicación web (`index.html`, `styles.css` y `app.js`).

```
[Herramientas]

Cotizador interno de paginas web para un desarrollador web junior

[Objetivo]

Estimar rapidamente la media de presupuestos de cada una de las principales paginas web mas demandadas del mercado

[Contexto]

soy un estudiante de sistemas del tercer anio, nivel Junior y quiero empezar a entender presupuestos, las demandas de hoy en dia, tiempos estimados, etc.

[Usuarios]

Equipo interno de trabajo del desarrollo de la pagina

[Inputs o preguntas que hacerse para armar el presupuesto]

cuantas paginas requiere el proyecto?
cuanto tiempo estimado necesita el proyecto?
cuantos mvp va a tener?
cuantas herramientas de tecnologia va  a usar?
que aproximado de costo de ia va a usar?
cual va a ser su mantenimiento?
(Si consideras que necesitas mas preguntas para estimar correctamente un proyecto de desarrollo web, agregalas y justificalas)

[Logica]

usa valores ficticios editables en el codigo (en pesos argentinos y en dolares adaptados automaticamente)
los valores base tienen que estar agrupados al principio de JavaScript para modificarlos facilmente, necesito que cada una de las posibles combinaciones tengan al menos 3 valores, minimo,recomendado y premium. Para que despues se puedan tener en cuenta en los calculos, es decir cada uno de los resultados debe ser un array (minimo,recomendado,premium)
El resultado no debe ser un precio final sino un rango estimado

[OutPut]

presupuesto minimo;
presupuesto recomendado;
presupuesto premium;
desglose por etapas y su tiempo estimado;
alertas de complejidad;
principales factores que encarecen del proyecto (poner los 3 primeros unicamente)

[Disenio]

-basarse en el disenio del portfolio anteriormente hecho en la carpeta "portfolio-thiago"
-estilo herramienta interna profesional
-responsive
-rapido de usar
-claro
-sin estetica de landing
-con botones visibles
-un boton para copiar el resumen
-que parezca una pagina de propuestas de un desarrollador PRO, que den estimulos rapidos  y den ganas de seguir o contactar al creador de la misma

[Restricciones]

3 archivos  unicos (html,css,js)
sin backend (o con valores en JSON para usar con backend despues)
sin librerias externas
comentar las partes editables
que sea legible el codigo


(Si necesitas mas cosas previas a la creacion de la misma indicarmelo y preguntarme)
```

---

## Prompt 2 · Aprender cómo funciona el código

Con este prompt se generó una guía de estudio para entender el código de la aplicación, con el objetivo de comprender lo que hace la IA y no depender de ella a ciegas.

```
La aplicacion me encanta ahora vas a hacer esto:

[Rol]

Desarrollador Full stack senior que da cursos  y clases para jovenes desarrolladores que estan empezando en el mundo de la programacion

[Objetivo]

Tratar de explicar paso por paso que hace cada parte del codigo, como lo hiciste, porque y que ventajas y desventajas tiene haberlo hecho de esta manera

[Contexto]

soy un estudiante del tercer anio de la carrera  de sistemas  y estoy haciendo un curso de inteligencia artificial, donde estoy aprendiendo a generar prompts mas eficientes para enviarte, luego de enviarte un prompt mas que  eficiente logre la aplicacion web que generaste recien, pero ahora quiero aprender las bases de la pagina, su codigo, sus funciones, estilos, todo lo que conllevo hacerlo para entender y mas adelante cuando tenga  que hacer proyectos mas grandes con vos poder entender que estas haciendo y no ser solamente un esclavo de la ia

[Formato]

paso por paso, explicacion detallada con el nivel para un desarrollador trainee que es un estudiante  de sistemas, que luego  de todas las explicaciones el desarrollador sea capaz de comprender y saber explicar la mayoria del codigo

[Restricciones]

no dejes por sentado que se algo, trata de explicar la mayoria de cosas, tomate tu tiempo, preferiblemente mostrar cada parte que estas explicando
```
