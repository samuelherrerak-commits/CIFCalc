// Orden de compra Briggs 40ft (primera compra en China, 6 fábricas, 43 productos).
// Datos de la plantilla Plantilla_Orden_Compra_FOB_CIF_Briggs_40ft_Consolidado_vfinal.xlsx.
// Cantidad = piezas pedidas y pagadas. Unid./caja = piezas ÷ cajas de la
// plantilla, para que el volumen (y el flete repartido) sea el mismo del Excel.
// Fotos en img/oc-briggs-40ft/.
export const OC_BRIGGS_40FT = {
  name: 'Orden de compra Briggs 40ft',
  container: { container_capacity: 68, container_max_weight: 26500, ocean_freight: 11000.0, insurance_enabled: true, insurance_rate: 1.0, insurance_basis: 'cfr110', vat_rate: 16 },
  photoBase: 'img/oc-briggs-40ft/',
  // [fábrica, SKU, descripción, partida arancelaria, FOB unit., cantidad, unid./caja, m³ por caja, kg por caja, foto]
  items: [
    ["FLOVA", "FH9806-D128", "Quba — Single lever basin mixer (H: 158mm, Cartridge Ø25mm, Aerator Neoperl, Cromo)", "84818090", 45.1, 100, 5.882353, 0.072, 19.0, "foto-01.png"],
    ["FLOVA", "FH9806-D128-SG*", "Quba — Single lever basin mixer (H: 158mm, Acabado SG - Precio est. +21.87% validar c/ fábrica)", "84818090", 54.96, 50, 5.555556, 0.072, 19.0, "foto-01.png"],
    ["FLOVA", "FH7305A-D129", "Quba — Single lever concealed mixer with 2 GoClick on/off buttons + SmartBOX (Ø40mm)", "84818090", 86.3, 100, 4.0, 0.04715, 14.0, "foto-02.png"],
    ["FLOVA", "FHS50", "Quba — Brass rain shower head (1/2\" connection, Brass construction)", "74182000", 24.6, 100, 14.285714, 0.065293, 17.0, "foto-03.png"],
    ["FLOVA", "FHS16G", "Quba — 10\" Brass rain shower (250x250mm, Air-Mix shower technology, Easy clean)", "74182000", 44.8, 100, 5.0, 0.038048, 11.0, "foto-04.png"],
    ["FLOVA", "FHS50-SG", "Quba — Brass rain shower head (1/2\" connection, Brass construction)", "74182000", 28.29, 100, 14.285714, 0.065293, 17.0, "foto-03.png"],
    ["FLOVA", "FHS16G-SG", "Quba — 10\" Brass rain shower (250x250mm, Air-Mix shower technology, Easy clean)", "74182000", 50.952, 100, 5.0, 0.038048, 11.0, "foto-04.png"],
    ["FLOVA", "FH9827D-D122", "Stream — Single lever basin mixer (Cartridge Ø25mm, Cascade aerator, 40cm flexible hoses, Cromo)", "84818090", 57.8, 100, 5.882353, 0.0546, 10.0, "foto-05.png"],
    ["FLOVA", "FH9827D-D122-SG", "Stream — Single lever basin mixer (Cartridge Ø25mm, Cascade aerator, Satin Gold)", "84818090", 67.0, 50, 5.555556, 0.0546, 10.0, "foto-06.png"],
    ["FLOVA", "FH7305AS-6015", "Stream — Thermostatic concealed mixer with 2 GoSlide controllers (Brass plate, SmartBOX, 2 in / 3 out)", "84818090", 100.1, 100, 4.0, 0.047502, 15.5, "foto-07.png"],
    ["FLOVA", "FH8912", "Accesorios — Brass single towel bar (Size: 600mm, Center length 562mm, Cromo)", "83025000", 20.8, 100, 20.0, 0.0637, 23.0, "foto-08.png"],
    ["FLOVA", "FH8912-SG", "Accesorios — Brass single towel bar (Size: 600mm, Center length 562mm,( SG)", "83025000", 27.0, 40, 20.0, 0.0637, 23.0, "foto-08.png"],
    ["FLOVA", "FH8921", "Accesorios — Toilet roll holder (Brass Center length 72mm, Cromo)", "83025000", 8.1, 100, 50.0, 0.03465, 20.0, "foto-09.png"],
    ["FLOVA", "FH8921-SG", "Accesorios — Toilet roll holder (Brass Center length 72mm, SG)", "83025000", 10.5, 40, 40.0, 0.03465, 20.0, "foto-09.png"],
    ["FLOVA", "FH8922", "Accesorios — Brass robe hook (Cromo)", "83025000", 4.6, 100, 100.0, 0.021824, 15.0, "foto-10.png"],
    ["FLOVA", "FH8922-SG", "Accesorios — Brass robe hook (SG)", "83025000", 6.0, 40, 40.0, 0.021824, 15.0, "foto-10.png"],
    ["FLOVA", "FH8915A", "Accesorios — Guest towel ring (Brass Center length 158mm, Cromo)", "83025000", 10.8, 100, 25.0, 0.041184, 16.5, "foto-11.png"],
    ["FLOVA", "FH8915A-SG", "Accesorios — Guest towel ring (Brass Center length 158mm, (SG)", "83025000", 14.0, 40, 20.0, 0.041184, 16.5, "foto-11.png"],
    ["WIDE", "1L187601CP", "Faucet — High Basin Faucet (S.S. Body, Zinc Handle, Neoperl Aerator, Sedal Cartridge, 600mm UPC hose, Chrome)", "84818090", 19.39, 200, 11.764706, 0.07, 17.5, "foto-12.png"],
    ["WIDE", "1L242600CJ", "Faucet — Kitchen Faucet (Zinc Alloy Body & Bracket, Sedal Cartridge, S.S. Spring Hose, Neoperl Aerator, Chrome)", "84818090", 41.38, 100, 6.666667, 0.084, 18.5, "foto-13.png"],
    ["WIDE", "KF2080", "Faucet — Kitchen Faucet (SS Body, SS Handle, SS bent pipe, Round spray gun , Sedal Cartridge, UPC hot & cold braided hose, Nylon Braided Quick- connet pull out hose", "84818090", 35.44, 100, 6.666667, 0.084, 19.5, "foto-14.png"],
    ["WIDE", "1W302400CP", "Faucet — Thermostatic Concealed Valve Set (Vernet Cartridge, SUS Rectangular 3-Hole Trim Plate, Push-Button)", "84818090", 62.58, 100, 4.0, 0.047502, 20.5, "foto-15.png"],
    ["WIDE", "1W302500CP", "Faucet — Thermostatic Concealed Valve Set (Brass Valve Body, Vernet Cartridge, SUS Round Trim Plate, Chrome)", "84818090", 61.4, 100, 4.0, 0.047502, 21.5, "foto-16.png"],
    ["SAMLIYU", "BA068", "Basin Mixer — Low basin mixer (S.S304 Body & Handle, Neoperl Aerator, Sedal Cartridge, cUPC hoses, Chrome)", "84818090", 14.2, 200, 20.0, 0.05365, 22.5, "foto-17.png"],
    ["SAMLIYU", "DB052", "Shower System — Pressure-balance shower system complete (Brass body + concealed box, Sedal 40mm, 10\" SS304 rain shower, Chrome) Round", "84818090", 72.6, 100, 5.882353, 0.19404, 23.5, "foto-18.png"],
    ["SAMLIYU", "DB053", "Shower System — Pressure-balance shower system complete (Brass body + concealed box, Sedal 40mm, 10\" SS304 rain shower, Chrome) Square", "84818090", 72.6, 100, 5.882353, 0.142311, 24.5, "foto-19.png"],
    ["SAMLIYU", "DA033-1", "Shower System — Shower mixer-single funtion, Main body: SS304, with concealed box, Face olate:SS201, Handle: SS304, Catridge: Sedal, Finish: Chrome, Round", "84818091", 16.3, 100, 10.0, 0.08208, 25.5, ""],
    ["SAMLIYU", "DA033-2", "Shower System — Shower mixer-single funtion, Main body: SS304, with concealed box, Face olate:SS201, Handle: SS304, Catridge: Sedal, Finish: Chrome, Square", "84818092", 16.3, 100, 10.0, 0.08208, 26.5, ""],
    ["SAMLIYU", "8101LM", "Basin Mixer — Low basin mixer (Brass Hpb59-1, Handle SS304, Neoperl Aerator, Sedal Cartridge, cUPC hoses, Chrome - Ref B101lm)", "84818090", 35.8, 100, 20.0, 0.05365, 27.5, "foto-20.png"],
    ["SAMLIYU", "BA106", "Basin Mixer — Low basin mixer (Lead-free Brass HBI59-1 <0.2% Pb, Zinc Handle, Neoperl Aerator, Wanhai Cartridge, Chrome)", "84818090", 37.9, 100, 20.0, 0.05365, 28.5, "foto-21.png"],
    ["TONA", "TONA-CARA600", "CARA-600 — CARA-600 Vanity Set: Basin (600*480*175) + Cabinet (592*474*450, Melamine two drawers with inner, DTC slide)", "94036099", 99.8, 50, 1.0, 0.169, 28.0, "foto-22.png"],
    ["TONA", "TONA-REF5-600", "Mod-600 (Ref 5) — Vanity Set 600mm (Ref 5): Cabinet C11060528MD0060731 (592*474*500) + Resin Basin 28060030-1P1 (600*480*150)", "94036099", 98.0, 50, 1.0, 0.1859, 30.0, "foto-23.png"],
    ["TONA", "TONA-REF7-600", "Mod-600 (Ref 7) — Vanity Set 600mm (Ref 7): Cabinet C11060528MD0060731 (592*474*500) + Resin Basin 28060030-1P1 (600*480*150)", "94036099", 93.7, 50, 1.0, 0.1859, 30.0, "foto-24.png"],
    ["HAIBA", "HB1C15823C", "HB823 — Basin mixer (Sedal cartridge, Neoperl aerator, 40cm nylon hose, plastic pop-up drainer 1 1/4\" 102301, Briggs color box, Chrome)", "84818090", 31.5, 200, 11.764706, 0.047502, 31.0, "foto-25.png"],
    ["HAIBA", "HB1C45849C", "HB849 — Basin mixer (26mm Sedal cartridge, Neoperl aerator, 40cm nylon hose, plastic pop-up drainer 1 1/4\" 102301, Briggs color box, Chrome)", "84818090", 28.1, 200, 11.764706, 0.047502, 32.0, "foto-26.png"],
    ["DIYA", "01101BC", "Vela — Robe hook (Zinc alloy + 304 SUS, ASS24H Salt spray, Chrome)", "83025000", 3.05, 100, 50.0, 0.0175, 8.0, "foto-27.png"],
    ["DIYA", "01101BC-GG", "Vela — Robe hook (Zinc alloy + 304 SUS, ASS24H Salt spray, Gun Grey)", "83025000", 4.11, 50, 50.0, 0.0175, 8.0, "foto-27.png"],
    ["DIYA", "01107BC", "Vela — Paper holder (Zinc alloy + 304 SUS, ASS24H Salt spray, Chrome)", "83025000", 5.68, 100, 25.0, 0.03, 12.0, "foto-28.png"],
    ["DIYA", "01107BC-GG", "Vela — Paper holder (Zinc alloy + 304 SUS, ASS24H Salt spray, Gun Grey)", "83025000", 6.63, 50, 25.0, 0.03, 12.0, "foto-28.png"],
    ["DIYA", "01111BC-01", "Vela — Towel bar 350mm (Zinc alloy + 304 SUS, ASS24H Salt spray, Chrome)", "83025000", 14.53, 100, 20.0, 0.03375, 15.0, "foto-29.png"],
    ["DIYA", "01111BC-01-GG", "Vela — Towel bar 350mm (Zinc alloy + 304 SUS, ASS24H Salt spray, Gun Grey)", "83025000", 16.21, 50, 16.666667, 0.03375, 15.0, "foto-29.png"],
    ["DIYA", "01111BC-02", "Vela — Towel bar 600mm (Zinc alloy + 304 SUS, ASS24H Salt spray, Chrome)", "83025000", 15.68, 100, 20.0, 0.04875, 18.0, "foto-30.png"],
    ["DIYA", "01111BC-02-GG", "Vela — Towel bar 600mm (Zinc alloy + 304 SUS, ASS24H Salt spray, Gun Grey)", "83025000", 16.74, 50, 16.666667, 0.04875, 18.0, "foto-30.png"]
  ]
};
