/**
 * ============================================================================
 *  IMPORTAR: Orden de compra Briggs 40ft (primera compra en China)
 * ----------------------------------------------------------------------------
 *  Crea el contenedor "Orden de compra Briggs 40ft" con sus 43 productos (de
 *  la plantilla Plantilla_Orden_Compra_FOB_CIF_Briggs_40ft_Consolidado), las
 *  6 fábricas como proveedores y la foto de cada producto en Drive (carpeta
 *  fotos_productos). No crea productos del catálogo ni códigos Briggs.
 *
 *  Cómo usarlo (una sola vez): en el editor elige la función
 *  importarOrdenCompraBriggs40ft y pulsa Ejecutar. Si el contenedor ya
 *  existe no hace nada (no lo duplica).
 *
 *  Cantidad = piezas pedidas y pagadas. "Unid./caja" es la efectiva (piezas
 *  ÷ cajas de la plantilla) para que el volumen y el flete repartido sean
 *  los mismos del Excel. Seguro: 1 % sobre el 110 % del CFR.
 * ============================================================================
 */

const OC_BRIGGS_40FT_FOTOS_URL = 'https://cifcalc.onrender.com/img/oc-briggs-40ft/';
const OC_BRIGGS_40FT = {
 "container": {
  "bl_number": "Orden de compra Briggs 40ft",
  "container_capacity": 68,
  "container_max_weight": 26500,
  "ocean_freight": 11000.0,
  "insurance_enabled": true,
  "insurance_rate": 1.0,
  "insurance_basis": "cfr110",
  "vat_rate": 16
 },
 "items": [
  {
   "fila": 15,
   "supplier": "FLOVA",
   "sku": "FH9806-D128",
   "name": "Quba — Single lever basin mixer (H: 158mm, Cartridge Ø25mm, Aerator Neoperl, Cromo)",
   "hs_code": "84818090",
   "estado": "Confirmado",
   "fob_unit": 45.1,
   "qty": 100,
   "units_per_box": 5.882353,
   "box_volume": 0.072,
   "weight_kg": 19.0,
   "foto": "foto-01.png",
   "excel_cif_total": 4816.44
  },
  {
   "fila": 16,
   "supplier": "FLOVA",
   "sku": "FH9806-D128-SG*",
   "name": "Quba — Single lever basin mixer (H: 158mm, Acabado SG - Precio est. +21.87% validar c/ fábrica)",
   "hs_code": "84818090",
   "estado": "Estimado - Validar",
   "fob_unit": 54.96,
   "qty": 50,
   "units_per_box": 5.555556,
   "box_volume": 0.072,
   "weight_kg": 19.0,
   "foto": "foto-01.png",
   "excel_cif_total": 2914.2
  },
  {
   "fila": 17,
   "supplier": "FLOVA",
   "sku": "FH7305A-D129",
   "name": "Quba — Single lever concealed mixer with 2 GoClick on/off buttons + SmartBOX (Ø40mm)",
   "hs_code": "84818090",
   "estado": "Confirmado",
   "fob_unit": 86.3,
   "qty": 100,
   "units_per_box": 4.0,
   "box_volume": 0.04715,
   "weight_kg": 14.0,
   "foto": "foto-02.png",
   "excel_cif_total": 8972.27
  },
  {
   "fila": 18,
   "supplier": "FLOVA",
   "sku": "FHS50",
   "name": "Quba — Brass rain shower head (1/2\" connection, Brass construction)",
   "hs_code": "74182000",
   "estado": "Confirmado",
   "fob_unit": 24.6,
   "qty": 100,
   "units_per_box": 14.285714,
   "box_volume": 0.065293,
   "weight_kg": 17.0,
   "foto": "foto-03.png",
   "excel_cif_total": 2582.96
  },
  {
   "fila": 19,
   "supplier": "FLOVA",
   "sku": "FHS16G",
   "name": "Quba — 10\" Brass rain shower (250x250mm, Air-Mix shower technology, Easy clean)",
   "hs_code": "74182000",
   "estado": "Confirmado",
   "fob_unit": 44.8,
   "qty": 100,
   "units_per_box": 5.0,
   "box_volume": 0.038048,
   "weight_kg": 11.0,
   "foto": "foto-04.png",
   "excel_cif_total": 4688.95
  },
  {
   "fila": 20,
   "supplier": "FLOVA",
   "sku": "FHS50-SG",
   "name": "Quba — Brass rain shower head (1/2\" connection, Brass construction)",
   "hs_code": "74182000",
   "estado": "Confirmado",
   "fob_unit": 28.29,
   "qty": 100,
   "units_per_box": 14.285714,
   "box_volume": 0.065293,
   "weight_kg": 17.0,
   "foto": "foto-03.png",
   "excel_cif_total": 2956.02
  },
  {
   "fila": 21,
   "supplier": "FLOVA",
   "sku": "FHS16G-SG",
   "name": "Quba — 10\" Brass rain shower (250x250mm, Air-Mix shower technology, Easy clean)",
   "hs_code": "74182000",
   "estado": "Confirmado",
   "fob_unit": 50.952,
   "qty": 100,
   "units_per_box": 5.0,
   "box_volume": 0.038048,
   "weight_kg": 11.0,
   "foto": "foto-04.png",
   "excel_cif_total": 5310.92
  },
  {
   "fila": 22,
   "supplier": "FLOVA",
   "sku": "FH9827D-D122",
   "name": "Stream — Single lever basin mixer (Cartridge Ø25mm, Cascade aerator, 40cm flexible hoses, Cromo)",
   "hs_code": "84818090",
   "estado": "Confirmado",
   "fob_unit": 57.8,
   "qty": 100,
   "units_per_box": 5.882353,
   "box_volume": 0.0546,
   "weight_kg": 10.0,
   "foto": "foto-05.png",
   "excel_cif_total": 6038.35
  },
  {
   "fila": 23,
   "supplier": "FLOVA",
   "sku": "FH9827D-D122-SG",
   "name": "Stream — Single lever basin mixer (Cartridge Ø25mm, Cascade aerator, Satin Gold)",
   "hs_code": "84818090",
   "estado": "Confirmado",
   "fob_unit": 67.0,
   "qty": 50,
   "units_per_box": 5.555556,
   "box_volume": 0.0546,
   "weight_kg": 10.0,
   "foto": "foto-06.png",
   "excel_cif_total": 3489.96
  },
  {
   "fila": 24,
   "supplier": "FLOVA",
   "sku": "FH7305AS-6015",
   "name": "Stream — Thermostatic concealed mixer with 2 GoSlide controllers (Brass plate, SmartBOX, 2 in / 3 out)",
   "hs_code": "84818090",
   "estado": "Confirmado",
   "fob_unit": 100.1,
   "qty": 100,
   "units_per_box": 4.0,
   "box_volume": 0.047502,
   "weight_kg": 15.5,
   "foto": "foto-07.png",
   "excel_cif_total": 10369.3
  },
  {
   "fila": 25,
   "supplier": "FLOVA",
   "sku": "FH8912",
   "name": "Accesorios — Brass single towel bar (Size: 600mm, Center length 562mm, Cromo)",
   "hs_code": "83025000",
   "estado": "Estimado - Validar",
   "fob_unit": 20.8,
   "qty": 100,
   "units_per_box": 20.0,
   "box_volume": 0.0637,
   "weight_kg": 23.0,
   "foto": "foto-08.png",
   "excel_cif_total": 2169.71
  },
  {
   "fila": 26,
   "supplier": "FLOVA",
   "sku": "FH8912-SG",
   "name": "Accesorios — Brass single towel bar (Size: 600mm, Center length 562mm,( SG)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 27.0,
   "qty": 40,
   "units_per_box": 20.0,
   "box_volume": 0.0637,
   "weight_kg": 23.0,
   "foto": "foto-08.png",
   "excel_cif_total": 1118.61
  },
  {
   "fila": 27,
   "supplier": "FLOVA",
   "sku": "FH8921",
   "name": "Accesorios — Toilet roll holder (Brass Center length 72mm, Cromo)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 8.1,
   "qty": 100,
   "units_per_box": 50.0,
   "box_volume": 0.03465,
   "weight_kg": 20.0,
   "foto": "foto-09.png",
   "excel_cif_total": 833.45
  },
  {
   "fila": 28,
   "supplier": "FLOVA",
   "sku": "FH8921-SG",
   "name": "Accesorios — Toilet roll holder (Brass Center length 72mm, SG)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 10.5,
   "qty": 40,
   "units_per_box": 40.0,
   "box_volume": 0.03465,
   "weight_kg": 20.0,
   "foto": "foto-09.png",
   "excel_cif_total": 431.89
  },
  {
   "fila": 29,
   "supplier": "FLOVA",
   "sku": "FH8922",
   "name": "Accesorios — Brass robe hook (Cromo)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 4.6,
   "qty": 100,
   "units_per_box": 100.0,
   "box_volume": 0.021824,
   "weight_kg": 15.0,
   "foto": "foto-10.png",
   "excel_cif_total": 469.64
  },
  {
   "fila": 30,
   "supplier": "FLOVA",
   "sku": "FH8922-SG",
   "name": "Accesorios — Brass robe hook (SG)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 6.0,
   "qty": 40,
   "units_per_box": 40.0,
   "box_volume": 0.021824,
   "weight_kg": 15.0,
   "foto": "foto-10.png",
   "excel_cif_total": 247.22
  },
  {
   "fila": 31,
   "supplier": "FLOVA",
   "sku": "FH8915A",
   "name": "Accesorios — Guest towel ring (Brass Center length 158mm, Cromo)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 10.8,
   "qty": 100,
   "units_per_box": 25.0,
   "box_volume": 0.041184,
   "weight_kg": 16.5,
   "foto": "foto-11.png",
   "excel_cif_total": 1126.45
  },
  {
   "fila": 32,
   "supplier": "FLOVA",
   "sku": "FH8915A-SG",
   "name": "Accesorios — Guest towel ring (Brass Center length 158mm, (SG)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 14.0,
   "qty": 40,
   "units_per_box": 20.0,
   "box_volume": 0.041184,
   "weight_kg": 16.5,
   "foto": "foto-11.png",
   "excel_cif_total": 583.44
  },
  {
   "fila": 33,
   "supplier": "WIDE",
   "sku": "1L187601CP",
   "name": "Faucet — High Basin Faucet (S.S. Body, Zinc Handle, Neoperl Aerator, Sedal Cartridge, 600mm UPC hose, Chrome)",
   "hs_code": "84818090",
   "estado": "Falta Empaque",
   "fob_unit": 19.39,
   "qty": 200,
   "units_per_box": 11.764706,
   "box_volume": 0.07,
   "weight_kg": 17.5,
   "foto": "foto-12.png",
   "excel_cif_total": 4170.36
  },
  {
   "fila": 34,
   "supplier": "WIDE",
   "sku": "1L242600CJ",
   "name": "Faucet — Kitchen Faucet (Zinc Alloy Body & Bracket, Sedal Cartridge, S.S. Spring Hose, Neoperl Aerator, Chrome)",
   "hs_code": "84818090",
   "estado": "Falta Empaque",
   "fob_unit": 41.38,
   "qty": 100,
   "units_per_box": 6.666667,
   "box_volume": 0.084,
   "weight_kg": 18.5,
   "foto": "foto-13.png",
   "excel_cif_total": 4447.91
  },
  {
   "fila": 35,
   "supplier": "WIDE",
   "sku": "KF2080",
   "name": "Faucet — Kitchen Faucet (SS Body, SS Handle, SS bent pipe, Round spray gun , Sedal Cartridge, UPC hot & cold braided hose, Nylon Braided Quick- connet pull out hose",
   "hs_code": "84818090",
   "estado": "Falta Empaque",
   "fob_unit": 35.44,
   "qty": 100,
   "units_per_box": 6.666667,
   "box_volume": 0.084,
   "weight_kg": 19.5,
   "foto": "foto-14.png",
   "excel_cif_total": 3847.37
  },
  {
   "fila": 36,
   "supplier": "WIDE",
   "sku": "1W302400CP",
   "name": "Faucet — Thermostatic Concealed Valve Set (Vernet Cartridge, SUS Rectangular 3-Hole Trim Plate, Push-Button)",
   "hs_code": "84818090",
   "estado": "Falta Empaque",
   "fob_unit": 62.58,
   "qty": 100,
   "units_per_box": 4.0,
   "box_volume": 0.047502,
   "weight_kg": 20.5,
   "foto": "foto-15.png",
   "excel_cif_total": 6576.02
  },
  {
   "fila": 37,
   "supplier": "WIDE",
   "sku": "1W302500CP",
   "name": "Faucet — Thermostatic Concealed Valve Set (Brass Valve Body, Vernet Cartridge, SUS Round Trim Plate, Chrome)",
   "hs_code": "84818090",
   "estado": "Falta Empaque",
   "fob_unit": 61.4,
   "qty": 100,
   "units_per_box": 4.0,
   "box_volume": 0.047502,
   "weight_kg": 21.5,
   "foto": "foto-16.png",
   "excel_cif_total": 6456.73
  },
  {
   "fila": 38,
   "supplier": "SAMLIYU",
   "sku": "BA068",
   "name": "Basin Mixer — Low basin mixer (S.S304 Body & Handle, Neoperl Aerator, Sedal Cartridge, cUPC hoses, Chrome)",
   "hs_code": "84818090",
   "estado": "Cromo Confirmado",
   "fob_unit": 14.2,
   "qty": 200,
   "units_per_box": 20.0,
   "box_volume": 0.05365,
   "weight_kg": 22.5,
   "foto": "foto-17.png",
   "excel_cif_total": 2983.81
  },
  {
   "fila": 39,
   "supplier": "SAMLIYU",
   "sku": "DB052",
   "name": "Shower System — Pressure-balance shower system complete (Brass body + concealed box, Sedal 40mm, 10\" SS304 rain shower, Chrome) Round",
   "hs_code": "84818090",
   "estado": "Cromo Confirmado",
   "fob_unit": 72.6,
   "qty": 100,
   "units_per_box": 5.882353,
   "box_volume": 0.19404,
   "weight_kg": 23.5,
   "foto": "foto-18.png",
   "excel_cif_total": 8032.03
  },
  {
   "fila": 40,
   "supplier": "SAMLIYU",
   "sku": "DB053",
   "name": "Shower System — Pressure-balance shower system complete (Brass body + concealed box, Sedal 40mm, 10\" SS304 rain shower, Chrome) Square",
   "hs_code": "84818090",
   "estado": "Cromo Confirmado",
   "fob_unit": 72.6,
   "qty": 100,
   "units_per_box": 5.882353,
   "box_volume": 0.142311,
   "weight_kg": 24.5,
   "foto": "foto-19.png",
   "excel_cif_total": 7847.5
  },
  {
   "fila": 41,
   "supplier": "SAMLIYU",
   "sku": "DA033-1",
   "name": "Shower System — Shower mixer-single funtion, Main body: SS304, with concealed box, Face olate:SS201, Handle: SS304, Catridge: Sedal, Finish: Chrome, Round",
   "hs_code": "84818091",
   "estado": "Cromo Confirmado",
   "fob_unit": 16.3,
   "qty": 100,
   "units_per_box": 10.0,
   "box_volume": 0.08208,
   "weight_kg": 25.5,
   "foto": "",
   "excel_cif_total": 1820.16
  },
  {
   "fila": 42,
   "supplier": "SAMLIYU",
   "sku": "DA033-2",
   "name": "Shower System — Shower mixer-single funtion, Main body: SS304, with concealed box, Face olate:SS201, Handle: SS304, Catridge: Sedal, Finish: Chrome, Square",
   "hs_code": "84818092",
   "estado": "Cromo Confirmado",
   "fob_unit": 16.3,
   "qty": 100,
   "units_per_box": 10.0,
   "box_volume": 0.08208,
   "weight_kg": 26.5,
   "foto": "",
   "excel_cif_total": 1820.16
  },
  {
   "fila": 43,
   "supplier": "SAMLIYU",
   "sku": "8101LM",
   "name": "Basin Mixer — Low basin mixer (Brass Hpb59-1, Handle SS304, Neoperl Aerator, Sedal Cartridge, cUPC hoses, Chrome - Ref B101lm)",
   "hs_code": "84818090",
   "estado": "Cromo Confirmado",
   "fob_unit": 35.8,
   "qty": 100,
   "units_per_box": 20.0,
   "box_volume": 0.05365,
   "weight_kg": 27.5,
   "foto": "foto-20.png",
   "excel_cif_total": 3675.67
  },
  {
   "fila": 44,
   "supplier": "SAMLIYU",
   "sku": "BA106",
   "name": "Basin Mixer — Low basin mixer (Lead-free Brass HBI59-1 <0.2% Pb, Zinc Handle, Neoperl Aerator, Wanhai Cartridge, Chrome)",
   "hs_code": "84818090",
   "estado": "Cromo Confirmado",
   "fob_unit": 37.9,
   "qty": 100,
   "units_per_box": 20.0,
   "box_volume": 0.05365,
   "weight_kg": 28.5,
   "foto": "foto-21.png",
   "excel_cif_total": 3887.98
  },
  {
   "fila": 45,
   "supplier": "TONA",
   "sku": "TONA-CARA600",
   "name": "CARA-600 — CARA-600 Vanity Set: Basin (600*480*175) + Cabinet (592*474*450, Melamine two drawers with inner, DTC slide)",
   "hs_code": "94036099",
   "estado": "Confirmado Tona",
   "fob_unit": 99.8,
   "qty": 50,
   "units_per_box": 1.0,
   "box_volume": 0.169,
   "weight_kg": 28.0,
   "foto": "foto-22.png",
   "excel_cif_total": 6817.96
  },
  {
   "fila": 46,
   "supplier": "TONA",
   "sku": "TONA-REF5-600",
   "name": "Mod-600 (Ref 5) — Vanity Set 600mm (Ref 5): Cabinet C11060528MD0060731 (592*474*500) + Resin Basin 28060030-1P1 (600*480*150)",
   "hs_code": "94036099",
   "estado": "Confirmado Tona",
   "fob_unit": 98.0,
   "qty": 50,
   "units_per_box": 1.0,
   "box_volume": 0.1859,
   "weight_kg": 30.0,
   "foto": "foto-23.png",
   "excel_cif_total": 6904.28
  },
  {
   "fila": 47,
   "supplier": "TONA",
   "sku": "TONA-REF7-600",
   "name": "Mod-600 (Ref 7) — Vanity Set 600mm (Ref 7): Cabinet C11060528MD0060731 (592*474*500) + Resin Basin 28060030-1P1 (600*480*150)",
   "hs_code": "94036099",
   "estado": "Confirmado Tona",
   "fob_unit": 93.7,
   "qty": 50,
   "units_per_box": 1.0,
   "box_volume": 0.1859,
   "weight_kg": 30.0,
   "foto": "foto-24.png",
   "excel_cif_total": 6686.92
  },
  {
   "fila": 48,
   "supplier": "HAIBA",
   "sku": "HB1C15823C",
   "name": "HB823 — Basin mixer (Sedal cartridge, Neoperl aerator, 40cm nylon hose, plastic pop-up drainer 1 1/4\" 102301, Briggs color box, Chrome)",
   "hs_code": "84818090",
   "estado": "Falta Empaque",
   "fob_unit": 31.5,
   "qty": 200,
   "units_per_box": 11.764706,
   "box_volume": 0.047502,
   "weight_kg": 31.0,
   "foto": "foto-25.png",
   "excel_cif_total": 6538.75
  },
  {
   "fila": 49,
   "supplier": "HAIBA",
   "sku": "HB1C45849C",
   "name": "HB849 — Basin mixer (26mm Sedal cartridge, Neoperl aerator, 40cm nylon hose, plastic pop-up drainer 1 1/4\" 102301, Briggs color box, Chrome)",
   "hs_code": "84818090",
   "estado": "Falta Empaque",
   "fob_unit": 28.1,
   "qty": 200,
   "units_per_box": 11.764706,
   "box_volume": 0.047502,
   "weight_kg": 32.0,
   "foto": "foto-26.png",
   "excel_cif_total": 5851.27
  },
  {
   "fila": 50,
   "supplier": "DIYA",
   "sku": "01101BC",
   "name": "Vela — Robe hook (Zinc alloy + 304 SUS, ASS24H Salt spray, Chrome)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 3.05,
   "qty": 100,
   "units_per_box": 50.0,
   "box_volume": 0.0175,
   "weight_kg": 8.0,
   "foto": "foto-27.png",
   "excel_cif_total": 315.7
  },
  {
   "fila": 51,
   "supplier": "DIYA",
   "sku": "01101BC-GG",
   "name": "Vela — Robe hook (Zinc alloy + 304 SUS, ASS24H Salt spray, Gun Grey)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 4.11,
   "qty": 50,
   "units_per_box": 50.0,
   "box_volume": 0.0175,
   "weight_kg": 8.0,
   "foto": "foto-27.png",
   "excel_cif_total": 211.43
  },
  {
   "fila": 52,
   "supplier": "DIYA",
   "sku": "01107BC",
   "name": "Vela — Paper holder (Zinc alloy + 304 SUS, ASS24H Salt spray, Chrome)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 5.68,
   "qty": 100,
   "units_per_box": 25.0,
   "box_volume": 0.03,
   "weight_kg": 12.0,
   "foto": "foto-28.png",
   "excel_cif_total": 599.43
  },
  {
   "fila": 53,
   "supplier": "DIYA",
   "sku": "01107BC-GG",
   "name": "Vela — Paper holder (Zinc alloy + 304 SUS, ASS24H Salt spray, Gun Grey)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 6.63,
   "qty": 50,
   "units_per_box": 25.0,
   "box_volume": 0.03,
   "weight_kg": 12.0,
   "foto": "foto-28.png",
   "excel_cif_total": 347.74
  },
  {
   "fila": 54,
   "supplier": "DIYA",
   "sku": "01111BC-01",
   "name": "Vela — Towel bar 350mm (Zinc alloy + 304 SUS, ASS24H Salt spray, Chrome)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 14.53,
   "qty": 100,
   "units_per_box": 20.0,
   "box_volume": 0.03375,
   "weight_kg": 15.0,
   "foto": "foto-29.png",
   "excel_cif_total": 1504.39
  },
  {
   "fila": 55,
   "supplier": "DIYA",
   "sku": "01111BC-01-GG",
   "name": "Vela — Towel bar 350mm (Zinc alloy + 304 SUS, ASS24H Salt spray, Gun Grey)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 16.21,
   "qty": 50,
   "units_per_box": 16.666667,
   "box_volume": 0.03375,
   "weight_kg": 15.0,
   "foto": "foto-29.png",
   "excel_cif_total": 840.66
  },
  {
   "fila": 56,
   "supplier": "DIYA",
   "sku": "01111BC-02",
   "name": "Vela — Towel bar 600mm (Zinc alloy + 304 SUS, ASS24H Salt spray, Chrome)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 15.68,
   "qty": 100,
   "units_per_box": 20.0,
   "box_volume": 0.04875,
   "weight_kg": 18.0,
   "foto": "foto-30.png",
   "excel_cif_total": 1636.39
  },
  {
   "fila": 57,
   "supplier": "DIYA",
   "sku": "01111BC-02-GG",
   "name": "Vela — Towel bar 600mm (Zinc alloy + 304 SUS, ASS24H Salt spray, Gun Grey)",
   "hs_code": "83025000",
   "estado": "Confirmado",
   "fob_unit": 16.74,
   "qty": 50,
   "units_per_box": 16.666667,
   "box_volume": 0.04875,
   "weight_kg": 18.0,
   "foto": "foto-30.png",
   "excel_cif_total": 876.89
  }
 ]
};

function importarOrdenCompraBriggs40ft() {
  ensureSheetsNow_();
  const d = OC_BRIGGS_40FT;
  const name = d.container.bl_number;
  const existing = readTable_('containers').filter(function (c) { return c.bl_number === name; })[0];
  if (existing) {
    Logger.log('Ya existe el contenedor "' + name + '" (id ' + existing.id + '). No se importó de nuevo.');
    return existing.id;
  }
  const now = new Date().toISOString();

  // Fábricas como proveedores (se reutilizan si ya existen con ese nombre).
  const suppliers = readTable_('suppliers');
  const supplierId = {};
  const newSuppliers = [];
  d.items.forEach(function (it) {
    if (supplierId[it.supplier]) return;
    const found = suppliers.filter(function (s) { return String(s.name).trim().toUpperCase() === it.supplier.toUpperCase(); })[0];
    if (found) { supplierId[it.supplier] = found.id; return; }
    const s = { id: Utilities.getUuid(), name: it.supplier, country: 'China', contact_email: '', contact_phone: '', created_at: now, updated_at: now };
    supplierId[it.supplier] = s.id;
    newSuppliers.push(s);
  });
  if (newSuppliers.length) upsert_('suppliers', newSuppliers);

  // Fotos: se bajan de la app (Render) y se guardan en Drive, una por archivo.
  const folder = carpetaFotos_('items');
  const fotos = {};
  const fotoDe = function (file) {
    if (!file) return null;
    if (fotos[file] !== undefined) return fotos[file];
    try {
      const res = UrlFetchApp.fetch(OC_BRIGGS_40FT_FOTOS_URL + file, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
      const f = folder.createFile(res.getBlob().setName('oc40ft_' + file));
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fotos[file] = { url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w400', id: f.getId() };
    } catch (e) {
      Logger.log('Sin foto ' + file + ': ' + e.message);
      fotos[file] = null;
    }
    return fotos[file];
  };

  const containerId = Utilities.getUuid();
  upsert_('containers', [{
    id: containerId, company_id: '', bl_number: name, operation_date: now.slice(0, 10),
    container_capacity: d.container.container_capacity, container_max_weight: d.container.container_max_weight,
    insurance_rate: d.container.insurance_rate, insurance_enabled: 'true', insurance_basis: d.container.insurance_basis,
    port_fee_rate: 0, vat_rate: d.container.vat_rate, ocean_freight: d.container.ocean_freight,
    inland_freight: 0, customs_expenses: 0, customs_broker_fee: 0, op_expenses: 0,
    status: 'draft', inventory_posted: 'false', created_at: now, updated_at: now
  }]);

  const rows = d.items.map(function (it) {
    const foto = fotoDe(it.foto);
    return {
      id: Utilities.getUuid(), container_id: containerId, product_id: '', supplier_id: supplierId[it.supplier],
      origin_country: 'China', sku: it.sku, sku_briggs: '', name: it.name, qty: it.qty,
      units_per_box: it.units_per_box, box_volume: it.box_volume, weight_kg: it.weight_kg, fob_unit: it.fob_unit,
      hs_code: it.hs_code, tariff_rate: 0, gain_margin: 0,
      foto_url: foto ? foto.url : '', foto_file_id: foto ? foto.id : '', created_at: now, updated_at: now
    };
  });
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_BATCH) upsert_('items', rows.slice(i, i + MAX_ROWS_PER_BATCH));
  Logger.log('Listo: contenedor "' + name + '" con ' + rows.length + ' productos y ' + Object.keys(fotos).filter(function (k) { return fotos[k]; }).length + ' fotos.');
  return containerId;
}
