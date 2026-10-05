DocFilling — SVG para web
========================

Todos los SVG tienen fondo transparente. El símbolo y las letras son trazados:
no necesitan fuentes instaladas, imágenes incrustadas ni conexiones externas.

docfilling-logo-light.svg : logo horizontal para fondos claros.
docfilling-logo-dark.svg  : logo horizontal para fondos oscuros.
docfilling-icon-light.svg : símbolo independiente para fondos claros.
docfilling-icon-dark.svg  : símbolo independiente para fondos oscuros.
docfilling-logo-mono.svg  : logo de un solo color (currentColor).
docfilling-icon-mono.svg  : símbolo de un solo color (currentColor).

Ejemplo:
<img src="/assets/docfilling-logo-light.svg" alt="DocFilling"
     style="width:240px;height:auto;display:block">

Las variantes "dark" están destinadas a superficies oscuras; el fondo no se
incluye. Las variantes "mono" heredan la propiedad CSS color cuando su SVG
se inserta inline. Si se usan como <img>, se muestran en negro por defecto.

Paleta:
Azul marino   #102B60
Azul vivo     #2468E8
Azul claro    #69AEFF (variante sobre fondo oscuro)
Blanco        #FFFFFF

Mantén la relación de aspecto al escalar. Estos archivos vectorizan la
propuesta bicolor seleccionada y normalizan sus colores a rellenos planos.
