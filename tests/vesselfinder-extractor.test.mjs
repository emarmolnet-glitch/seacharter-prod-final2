import assert from "node:assert/strict";
import test from "node:test";

import {
  extractVesselFinderDetailUrl,
  extractVesselFinderFields,
} from "../netlify/functions/_shared/vesselfinder-extractor.mjs";

test("VesselFinder search rows expose flag, vessel type, and LOA", () => {
  const html = `
    <table>
      <thead><tr><th>Vessel</th><th>Built</th><th>GT</th><th>DWT</th><th>Size (m)</th></tr></thead>
      <tbody><tr>
        <td><a class="ship-link" href="/vessels/details/9337250">
          <div class="flag-icon-med flag-icon" title="Liberia"></div>
          <div class="sli"><div class="slna">ADDISON</div><div class="slty">Container Ship</div></div>
        </a></td>
        <td>2006</td><td>27779</td><td>39345</td><td>222 / 30</td>
      </tr></tbody>
    </table>`;

  assert.deepEqual(extractVesselFinderFields(html, { imo: "9337250" }), {
    flag: "Liberia",
    vessel_type: "Container Ship",
    loa_meters: 222,
    beam_meters: 30,
    net_tonnage: null,
    call_sign: null,
    last_port: null,
    eta: null,
  });
  assert.equal(extractVesselFinderDetailUrl(html, { imo: "9337250" }), "/vessels/details/9337250");
});

test("VesselFinder detail pages expose technical and voyage fields", () => {
  const html = `
    <link rel="canonical" href="https://www.vesselfinder.com/vessels/details/9337250">
    <div class="title-flag-icon flag-icon" title="Liberia"></div>
    <section class="ship-section">
      <div class="flx">
        <div class="vi__r1"><div class="vilabel">Destination</div><a class="_npNa">Busan, Korea</a><div class="_value"><span class="_mcol12ext">ETA: Aug 4, 22:00</span></div></div>
      </div>
      <div class="flx">
        <div class="vi__r1"><div class="vilabel">Last Port</div><a class="_npNa">Tokyo, Japan</a><div class="_value">ATD: Jul 31, 09:26 UTC</div></div>
      </div>
      <table class="aparams"><tbody>
        <tr><td class="n3">Callsign</td><td class="v3">D5MB8</td></tr>
        <tr><td class="n3">Length / Beam</td><td class="v3">222 / 30 m</td></tr>
      </tbody></table>
      <table class="tpt1"><tbody>
        <tr><td class="tpc1">Ship Type</td><td class="tpc2">Container Ship</td></tr>
        <tr><td class="tpc1">Flag</td><td class="tpc2">Liberia</td></tr>
        <tr><td class="tpc1">Length Overall <small>(m)</small></td><td class="tpc2">222.15</td></tr>
        <tr><td class="tpc1">Beam <small>(m)</small></td><td class="tpc2">30.00</td></tr>
        <tr><td class="tpc1">Net Tonnage</td><td class="tpc2">16420</td></tr>
      </tbody></table>
    </section>`;

  assert.deepEqual(extractVesselFinderFields(html), {
    flag: "Liberia",
    vessel_type: "Container Ship",
    loa_meters: 222.15,
    beam_meters: 30,
    net_tonnage: 16420,
    call_sign: "D5MB8",
    last_port: "Tokyo, Japan",
    eta: "Aug 4, 22:00",
  });
  assert.equal(extractVesselFinderDetailUrl(html), "https://www.vesselfinder.com/vessels/details/9337250");
});
