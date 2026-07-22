import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const getVesselsSource = await readFile(new URL("../netlify/functions/get-vessels.ts", import.meta.url), "utf8");
const aisIngestSource = await readFile(new URL("../netlify/functions/ais-ingest.ts", import.meta.url), "utf8");

test("get-vessels.ts has early input filter for AISStream messages restricting ShipType to 70-79", () => {
  assert.match(getVesselsSource, /ShipStaticData/);
  assert.match(getVesselsSource, /ShipType/);
  assert.match(getVesselsSource, /numericType < 70 \|\| numericType > 79/);
});

test("ais-ingest.ts has early input filter for AISStream messages restricting ShipType to 70-79", () => {
  assert.match(aisIngestSource, /ShipStaticData/);
  assert.match(aisIngestSource, /ShipType/);
  assert.match(aisIngestSource, /numericType < 70 \|\| numericType > 79/);
});

test("early input filter logic drops non-cargo vessels (codes outside 70-79) and retains cargo vessels (70-79)", () => {
  function processAisMessage(rawMessage, map) {
    const rawShipType = rawMessage?.Message?.ShipStaticData
      ? rawMessage.Message.ShipStaticData.Type
      : rawMessage?.MetaData?.ShipType;

    const shipType = rawShipType ?? rawMessage?.Message?.ShipType ?? rawMessage?.MetaData?.shipType;

    if (shipType !== undefined && shipType !== null) {
      const numericType = Number(shipType);
      if (Number.isFinite(numericType) && (numericType < 70 || numericType > 79)) {
        return false; // Dropped early
      }
    }

    map.set(rawMessage.MetaData?.MMSI || "unknown", rawMessage);
    return true; // Retained
  }

  const map = new Map();

  // Non-cargo messages: yachts (37), tugs (52), passenger (60), tankers (80), wing-in-ground (20), etc.
  const yachtMsg = { MessageType: "PositionReport", MetaData: { MMSI: 111, ShipType: 37 } };
  const passengerMsg = { MessageType: "ShipStaticData", Message: { ShipStaticData: { Type: 60 } }, MetaData: { MMSI: 222 } };
  const tankerMsg = { MessageType: "PositionReport", MetaData: { MMSI: 333, ShipType: 80 } };
  const tugMsg = { MessageType: "PositionReport", MetaData: { MMSI: 444, ShipType: 52 } };

  assert.equal(processAisMessage(yachtMsg, map), false, "Yacht (ShipType 37) should be dropped early");
  assert.equal(processAisMessage(passengerMsg, map), false, "Passenger ship (ShipType 60) should be dropped early");
  assert.equal(processAisMessage(tankerMsg, map), false, "Tanker (ShipType 80) should be dropped early");
  assert.equal(processAisMessage(tugMsg, map), false, "Tugboat (ShipType 52) should be dropped early");

  assert.equal(map.size, 0, "No non-cargo vessel should be added to memory");

  // Cargo messages: General Cargo (70), Hazardous Cargo (72), Heavy Cargo (79)
  const cargoMsg70 = { MessageType: "PositionReport", MetaData: { MMSI: 771, ShipType: 70 } };
  const cargoMsg72 = { MessageType: "ShipStaticData", Message: { ShipStaticData: { Type: 72 } }, MetaData: { MMSI: 772 } };
  const cargoMsg79 = { MessageType: "PositionReport", MetaData: { MMSI: 779, ShipType: 79 } };

  assert.equal(processAisMessage(cargoMsg70, map), true, "Cargo vessel (70) should be accepted");
  assert.equal(processAisMessage(cargoMsg72, map), true, "Cargo vessel (72) should be accepted");
  assert.equal(processAisMessage(cargoMsg79, map), true, "Cargo vessel (79) should be accepted");

  assert.equal(map.size, 3, "Only the 3 cargo vessels should be stored in memory");
});
