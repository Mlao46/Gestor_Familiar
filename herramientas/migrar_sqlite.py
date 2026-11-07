"""Convierte la base de datos de la app antigua (mis_finanzas.db) en un archivo que la app nueva puede importar.

Uso:  python migrar_sqlite.py mis_finanzas.db migracion.json
Luego en la app: Ajustes > Datos > Importar datos de la app antigua.
El archivo contiene tus movimientos SIN cifrar: no lo subas a GitHub y bórralo después de importarlo.
"""
import json
import re
import sqlite3
import sys

MAPA = {
    ('Vivienda', 'Hipoteca/Alquiler'): 'viv-hipoteca', ('Vivienda', 'Comunidad'): 'viv-comunidad', ('Vivienda', 'IBI'): 'viv-ibi',
    ('Vivienda', 'Seguro'): 'viv-seguro', ('Vivienda', 'Agua'): 'viv-agua', ('Vivienda', 'Luz'): 'viv-luz',
    ('Vivienda', 'Calefacción'): 'viv-calefaccion', ('Vivienda', 'Internet/Teléfono'): 'viv-internet',
    ('Vivienda', 'Limpieza'): 'viv-limpieza', ('Vivienda', 'Mobiliario/Reformas'): 'viv-mobiliario', ('Vivienda', 'Extras'): 'viv-extras',
    ('Coche', 'Préstamo'): 'coc-prestamo', ('Coche', 'Seguro'): 'coc-seguro', ('Coche', 'Gasolina'): 'coc-gasolina',
    ('Coche', 'Plaza Garaje'): 'coc-garaje', ('Coche', 'Mantenimientos/Averías'): 'coc-mantenimiento',
    ('Coche', 'Impuesto Circulación'): 'coc-impuesto',
    ('Alimentación', 'Supermercado'): 'ali-super', ('Alimentación', 'Restaurantes'): 'ali-restaurantes',
    ('Niños', 'Colegio'): 'nin-colegio', ('Niños', 'Escuela Infantil'): 'nin-infantil', ('Niños', 'Piscina'): 'nin-piscina',
    ('Niños', 'Musica'): 'nin-musica', ('Niños', 'Ropa y Calzado'): 'nin-ropa',
    ('Suscripciones', 'Disney'): 'sus-disney', ('Suscripciones', 'Fund Cris'): 'sus-fundcris',
    ('Suscripciones', 'Monetepio'): 'sus-montepio', ('Suscripciones', 'Gemini'): 'sus-gemini',
    ('Suscripciones', 'Fotos Google'): 'sus-google', ('Suscripciones', 'Amazon'): 'sus-amazon',
    ('Salud', 'Farmacia'): 'sal-farmacia', ('Salud', 'Fisio'): 'sal-fisio', ('Salud', 'Dentista'): 'sal-dentista',
    ('Salud', 'Extras'): 'sal-extras',
    ('Ingresos', 'Nómina Mario'): 'ing-nomina-mario', ('Ingresos', 'Nómina Lorena'): 'ing-nomina-lorena',
    ('Ingresos', 'Maternidad'): 'ing-maternidad', ('Ingresos', 'Becas'): 'ing-becas', ('Ingresos', 'Wallapop'): 'ing-wallapop',
    ('Ingresos', 'Devolución Euroimmun'): 'ing-euroimmun', ('Ingresos', 'Extras'): 'ing-extras',
    ('Otros', 'Efectivo'): 'otr-compras', ('Otros', 'Ahorros'): 'otr-ahorro', ('Otros', 'Regalos'): 'otr-regalos',
    ('Otros', 'Gastos Euroimmun'): 'eur-gastos', ('Otros', 'Ropa y Calzado'): 'otr-ropa', ('Otros', 'Gastos Wallapop'): 'wal-compras',
    ('Otros', 'Electrónica'): 'otr-electronica',
    ('Ocio', 'Viajes'): 'oci-viajes', ('Ocio', 'Bono Parques'): 'oci-parques', ('Ocio', 'Actividades Fin de Semana'): 'oci-finde',
    ('Ocio', 'Impresora 3D'): 'oci-impresora',
}
KW_REGALO = re.compile(r'\b(CUMPLE|CUMPLEANOS|REGALO|BOTE)\b')
KW_COMIDA = re.compile(r'\b(CENA|COMIDA|BURGER|RESTAURANTE|COPAS|DESAYUNO|PIZZA)\b')


def convertir(ruta_db):
    c = sqlite3.connect(ruta_db)
    c.row_factory = sqlite3.Row
    movs = []
    for r in c.execute('select * from movimientos order by id'):
        desc = ' '.join(str(r['concepto'] or '').split())
        d = desc.upper()
        imp = round(float(r['importe']), 2)
        cat = MAPA.get((r['categoria'], r['subcategoria']))
        cuenta = r['cuenta'] or 'General'
        ambito = 'familia'  # el ámbito sale de la categoría (abajo)
        tarjeta = None
        m = re.search(r'\*{2,}(\d{4})', d)
        if d.startswith('TARJ.VISA') and m:
            tarjeta = m.group(1)
        if cat == 'otr-compras' and d.startswith('IBERCAJA D'):
            cat = 'otr-efectivo'  # retiradas de cajero
        if 'TRASPASO' in d:
            tipo, cat, ambito = 'traspaso', None, 'familia'
        elif r['categoria'] == 'Ingresos':
            if imp < 0:
                tipo, cat = 'gasto', None
            elif cat == 'ing-extras' and d.startswith('BIZUM ABONO') and KW_REGALO.search(d):
                tipo, cat = 'reembolso', 'otr-regalos'
            elif cat == 'ing-extras' and d.startswith('BIZUM ABONO') and KW_COMIDA.search(d):
                tipo, cat = 'reembolso', 'ali-restaurantes'
            elif cat == 'ing-extras' and re.match(r'^(AMAZON|AMZN|WWW\.AMAZON)', d):
                tipo, cat = 'reembolso', 'otr-compras'
            else:
                tipo = 'ingreso'
        else:
            tipo = 'reembolso' if imp > 0 else 'gasto'
        if cat in ('eur-gastos', 'ing-euroimmun'):
            ambito = 'euroimmun'
        if cat in ('wal-compras', 'ing-wallapop'):
            ambito = 'wallapop'
        movs.append({'fecha': str(r['fecha'])[:10], 'desc': desc, 'importe': imp, 'tipo': tipo, 'cat': cat,
                     'ambito': ambito, 'tarjeta': tarjeta})
    pres = {}
    for r in c.execute('select categoria, subcategoria, presupuesto from configuracion'):
        k = MAPA.get((r['categoria'], r['subcategoria']))
        if k and r['presupuesto']:
            pres[k] = float(r['presupuesto'])
    return {'formato': 'gestor-familiar-migracion', 'v': 1, 'movs': movs, 'presupuestos': pres}


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    datos = convertir(sys.argv[1])
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False)
    tipos = {}
    for m in datos['movs']:
        tipos[m['tipo']] = tipos.get(m['tipo'], 0) + 1
    print(f"{len(datos['movs'])} movimientos convertidos: {tipos}")
