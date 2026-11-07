// Categorías por defecto. El id es estable: renombrar una categoría nunca descoloca sus movimientos.
// tipo: 'gasto' | 'ingreso'

export const TIPOS = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  reembolso: 'Reembolso',   // dinero que vuelve y resta del gasto de su categoría (Bizum de amigos, devoluciones)
  traspaso: 'Traspaso',     // movimiento entre cuentas propias: no cuenta ni como gasto ni como ingreso
};

export const AMBITOS = {
  familia: 'Familia',
  wallapop: 'Wallapop',
  euroimmun: 'Euroimmun',
};

const def = (grupo, tipo, lista) => lista.map(([id, nombre, presupuesto = 0]) => ({ id, grupo, nombre, tipo, presupuesto }));

export const CATEGORIAS_BASE = [
  ...def('Vivienda', 'gasto', [
    ['viv-hipoteca', 'Hipoteca/Alquiler'], ['viv-comunidad', 'Comunidad'], ['viv-ibi', 'IBI'], ['viv-seguro', 'Seguro'],
    ['viv-agua', 'Agua'], ['viv-luz', 'Luz'], ['viv-calefaccion', 'Calefacción'], ['viv-internet', 'Internet/Teléfono'],
    ['viv-limpieza', 'Limpieza'], ['viv-mobiliario', 'Mobiliario/Reformas'], ['viv-extras', 'Extras'],
  ]),
  ...def('Coche', 'gasto', [
    ['coc-prestamo', 'Préstamo/Renting'], ['coc-seguro', 'Seguro'], ['coc-gasolina', 'Gasolina'], ['coc-garaje', 'Plaza Garaje/Parking'],
    ['coc-mantenimiento', 'Mantenimientos/Averías'], ['coc-impuesto', 'Impuesto Circulación'],
  ]),
  ...def('Alimentación', 'gasto', [['ali-super', 'Supermercado', 650], ['ali-restaurantes', 'Restaurantes', 150]]),
  ...def('Niños', 'gasto', [
    ['nin-colegio', 'Colegio'], ['nin-infantil', 'Escuela Infantil'], ['nin-piscina', 'Piscina'], ['nin-musica', 'Música'],
    ['nin-ropa', 'Ropa y Calzado'],
  ]),
  ...def('Suscripciones', 'gasto', [
    ['sus-disney', 'Disney'], ['sus-fundcris', 'Fund Cris'], ['sus-montepio', 'Montepío'], ['sus-gemini', 'Gemini'],
    ['sus-google', 'Fotos Google'], ['sus-amazon', 'Amazon Prime'],
  ]),
  ...def('Salud', 'gasto', [['sal-farmacia', 'Farmacia'], ['sal-fisio', 'Fisio'], ['sal-dentista', 'Dentista'], ['sal-extras', 'Extras']]),
  ...def('Ocio', 'gasto', [
    ['oci-viajes', 'Viajes'], ['oci-parques', 'Bono Parques'], ['oci-finde', 'Actividades Fin de Semana'], ['oci-impresora', 'Impresora 3D'],
  ]),
  ...def('Otros', 'gasto', [
    ['otr-efectivo', 'Efectivo (cajero)'], ['otr-compras', 'Compras varias'], ['otr-regalos', 'Regalos'], ['otr-ropa', 'Ropa y Calzado'],
    ['otr-electronica', 'Electrónica'], ['otr-ahorro', 'Ahorro'], ['otr-comisiones', 'Comisiones banco'],
  ]),
  ...def('Euroimmun', 'gasto', [['eur-gastos', 'Gastos de trabajo']]),
  ...def('Wallapop', 'gasto', [['wal-compras', 'Compras para revender']]),
  ...def('Ingresos', 'ingreso', [
    ['ing-nomina-mario', 'Nómina Mario'], ['ing-nomina-lorena', 'Nómina Lorena'], ['ing-maternidad', 'Maternidad'],
    ['ing-becas', 'Becas'], ['ing-wallapop', 'Ventas Wallapop'], ['ing-euroimmun', 'Devolución Euroimmun'], ['ing-extras', 'Extras'],
  ]),
];

// Ámbito sugerido por categoría
export const AMBITO_DE_CATEGORIA = {
  'eur-gastos': 'euroimmun', 'ing-euroimmun': 'euroimmun',
  'wal-compras': 'wallapop', 'ing-wallapop': 'wallapop',
};
