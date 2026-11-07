// Pruebas del núcleo con datos inventados. Ejecutar: node tests/nucleo.test.mjs
import assert from 'node:assert/strict';
import { leerCsv } from '../js/core/xlsx.js';
import { parsearExtracto } from '../js/core/banco.js';
import { clasificar, aprender, comercio, personaBizum, mensajeBizum } from '../js/core/clasificador.js';
import { CATEGORIAS_BASE } from '../js/core/categorias.js';
import { totales, filtrar } from '../js/core/calculos.js';
import { crearBoveda, abrirBoveda, importarClaveDatos, cifrarJSON, descifrarJSON, nuevaClaveFamiliar, protegerConPin, abrirConPin } from '../js/core/cripto.js';

const csv = `Consulta Movimientos de la Cuenta: ;;;;;;**9999;
;;;;;;;
Nº Orden;Fecha Oper;Fecha Valor;Concepto;Descripción;Referencia;Importe;Saldo
1;05-03-2026;05-03-2026;TARJETA VISA;SUPERMERCADO EJEMPLO;8460010001111;-45,30;954,70
2;04-03-2026;04-03-2026;IBERCAJA PAY;BIZUM ABONO ANA PEREZ RUIZ REGALO CUMPLE LUCAS . ORDEN: ANA PEREZ RUIZ;123;10,00;1000,00
3;03-03-2026;03-03-2026;TRANSFERENCIA INTERNA;TRASPASO A CUENTA DE AHORRO;;-200,00;990,00
4;02-03-2026;02-03-2026;OPERACION EN CAJERO AUTOMATICO;BANCO D2085990000000NC000;8460010002222;-50,00;1190,00
5;01-03-2026;01-03-2026;RECIBO AGUA;CANAL AGUA 007400000000SDD004000000;;-30,00;1240,00
6;01-03-2026;01-03-2026;TARJETA VISA;AMAZON.ES*AB12CD34E;8460010002222;-20,00;1270,00`;

const ex = parsearExtracto(leerCsv(csv));
assert.equal(ex.movs.length, 6);
assert.equal(ex.cuenta, '…9999');
assert.equal(ex.saldoOk, true);
assert.deepEqual([...new Set(ex.movs.map(m => m.tarjeta).filter(Boolean))].sort(), ['1111', '2222']);
assert.equal(comercio({ desc: 'AMAZON.ES*AB12CD34E' }), 'AMAZON.ES');
const biz = ex.movs[1];
assert.equal(personaBizum(biz), 'ANA PEREZ RUIZ');
assert.equal(mensajeBizum(biz), 'REGALO CUMPLE LUCAS');

const cats = Object.fromEntries(CATEGORIAS_BASE.map(c => [c.id, c]));
const ctx = { reglas: [], tarjetas: {}, cats };
const c = ex.movs.map(m => ({ ...m, ...clasificar(m, ctx) }));
assert.equal(c[1].tipo, 'reembolso'); assert.equal(c[1].cat, 'otr-regalos');
assert.equal(c[2].tipo, 'traspaso');
assert.equal(c[3].cat, 'otr-efectivo');
assert.equal(c[4].cat, 'viv-agua');
assert.equal(c[0].cat, null);

const regla = aprender(ex.movs[0], { cat: 'ali-super', tipo: 'gasto', ambito: 'familia' }, []);
assert.equal(regla.patron, 'SUPERMERCADO');
assert.equal(clasificar(ex.movs[0], { ...ctx, reglas: [regla] }).cat, 'ali-super');
assert.equal(aprender(ex.movs[5], { cat: 'otr-compras', tipo: 'gasto', ambito: 'familia' }, []), null, 'no aprende intermediarios');

const t = totales(filtrar(c, { mes: '2026-03' }));
assert.equal(t.traspasos, -200);
assert.equal(t.reembolsos, 10);

const raw = nuevaClaveFamiliar();
const bov = await crearBoveda(raw, 'contraseña de prueba', 1000);
assert.deepEqual(await abrirBoveda(bov, 'contraseña de prueba'), raw);
await assert.rejects(abrirBoveda(bov, 'otra'));
const k = await importarClaveDatos(raw);
const s = await cifrarJSON(k, { a: 1 }, 'id1');
assert.deepEqual(await descifrarJSON(k, s, 'id1'), { a: 1 });
await assert.rejects(descifrarJSON(k, s, 'id2'));
assert.deepEqual(await abrirConPin(await protegerConPin(raw, '1234'), '1234'), raw);
console.log('Todas las pruebas pasan');
