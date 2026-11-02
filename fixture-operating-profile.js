(function (root) {
    const text = value => String(value?.label || value?.value || value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    function resolve(state = {}) {
        const vessel = state.vessel && typeof state.vessel === 'object' ? state.vessel : {};
        const selected = text(state.vesselType || vessel.type || state.vessel_type || state.tipoBuque || state.shipProfile || state.ship_profile || state.designCategory || state.design_category || state.categoriaDiseno || state.class || state.vesselClass || state.vessel_class || state.shipClass);
        const cargo = [state.productoEspecifico, state.cargoProduct, state.cargo_product, state.commodity, state.cargoType].map(text).join(' ');
        const method = [state.loadingMethod, state.methodPOL, state.loading_method, state.loadMethod].map(text).join(' ');
        const bags = /big[ _-]?bags?|bagged|ensacad|sacas|sacos/i.test(cargo + ' ' + method + ' ' + selected);
        const generic = !selected || /^(?:handysize|bulk carrier|dry bulk|carga general|vessel type tbn)$/i.test(selected);
        const pneumatic = /cement|pneumat|neumat/i.test(selected) || (generic && !/free[ _-]?flow/i.test(method) && (/pneumat|neumat/i.test(method) || (!bags && /cement|cemento/i.test(cargo))));
        const roro = !pneumatic && /ro[ -]?ro|ro[ -]?lo|roll[ -]?on|vehicle|car carrier|\bpcc\b|\bpctc\b/i.test(selected);
        const standardBulk = /gearless|free[ _-]?flow|open[ _-]?holds?|bodegas abiertas|sin gruas/i.test(selected + ' ' + method) || (!bags && /bulk carrier|dry bulk|bulk cargo|granelero|a granel/i.test(selected + ' ' + cargo) && !/\bgeared\b|con gruas|with cranes|handysize|supramax|ultramax|\bmpp\b|multi[ -]?purpose/i.test(selected));
        const geared = !pneumatic && !roro && !standardBulk && (bags || /\bgeared\b|con gruas|with cranes|handysize|supramax|ultramax|\bmpp\b|multi[ -]?purpose/i.test(selected));
        const profile = pneumatic ? 'PNEUMATIC' : roro ? 'RORO' : geared ? 'GEARED' : 'GEARLESS';
        const vesselType = pneumatic ? 'Pneumatic Cement Carrier (Gearless / Sealed Holds)' : roro ? 'RoRo Carrier' : geared ? (bags ? 'Geared General Cargo / Big Bags' : selected || 'Geared General Cargo') : 'Gearless Bulk Carrier / Open Holds' + (/coaster|mini[ -]?bulker|cabot|costero|panamax|capesize/i.test(selected) ? ` (${selected})` : '');
        const positive = (...values) => values.map(Number).find(value => Number.isFinite(value) && value > 0);
        const rate = (...values) => { const value = positive(...values); return value ? value.toLocaleString('en-US') : 'TBA'; };
        const clause = pneumatic
            ? ['PNEUMATIC CLAUSE', 'PNEUMATIC EQUIPMENT & SEALED HOLDS: VESSEL IS GEARLESS. OWNERS SHALL PROVIDE AND MAINTAIN AIR PRESSURE AND AIRTIGHT HOSES FOR PNEUMATIC LOADING AND DISCHARGING, FREE OF ALL RISK AND EXPENSE TO CHARTERERS. HOLDS SHALL BE SEALED AND DRY; CHARTERERS SHALL ENSURE COMPATIBLE TERMINAL CONNECTIONS.']
            : roro ? ['RORO OPERATIONS', 'ROLL-ON / ROLL-OFF VIA VESSEL RAMPS, SUBJECT TO RAMP SWL, AXLE LOADS AND CLEARANCE. CAPACITY BY DECK SURFACE (M2) AND LANE METRES. CHARTERERS SHALL DECLARE UNIT DIMENSIONS AND WEIGHTS AND PROVIDE HANDLING AND LASHING UNDER MASTERS SUPERVISION.']
            : geared ? ['GEAR CLAUSE', "GEARED OPERATIONS: USE OF VESSEL'S CRANES IS MANDATORY WITHIN CERTIFIED SWL. OWNERS SHALL MAINTAIN SERVICEABLE GEAR; CHARTERERS SHALL PROVIDE STEVEDORES, DUNNAGE AND LASHING AND REMAIN RESPONSIBLE FOR HANDLING DAMAGE UNDER MASTERS SUPERVISION." + (bags ? ' SACKS / BIG BAGS SHALL USE CERTIFIED SLINGS, DRY DUNNAGE AND SECURING AGAINST SHIFTING; NO GRAB HANDLING OF BAGGED CARGO.' : ' BREAK BULK SHALL BE SECURED WITH SUITABLE SLINGS, DUNNAGE AND LASHING.')]
            : ['HANDLING CLAUSE', 'GEARLESS BULK CARRIER / OPEN HOLDS: TERMINAL HANDLING ARRANGEMENTS AND STOWAGE SHALL BE AGREED BEFORE FIXING. CHARTERERS SHALL PROVIDE SUITABLE TERMINAL EQUIPMENT AT THEIR EXPENSE.'];
        return { operationalProfile: profile, isPneumatic: pneumatic, isRoRo: roro, isGeared: geared, isBagged: bags, vesselType,
            loadRate: rate(state.loadRate, state.loadingRate, state.ratePOL), dischargeRate: rate(state.dischargeRate, state.dischRate, state.ratePOD), equipmentClause: clause };
    }
    function navalProfile(state = {}) {
        const operation = resolve(state);
        if (operation.operationalProfile === 'PNEUMATIC' || operation.operationalProfile === 'RORO') return operation.operationalProfile;
        const type = text(state.vesselType || state.shipProfile || state.class);
        if (operation.isGeared) return /supramax|ultramax/i.test(type) ? 'SUPRAMAX' : 'HANDYSIZE';
        if (/coaster|mini[ -]?bulker|cabot|costero/i.test(type)) return 'COASTER';
        if (/panamax/i.test(type)) return 'PANAMAX';
        if (/capesize/i.test(type)) return 'CAPESIZE';
        return 'GEARLESS';
    }
    root.FixtureOperatingProfile = { resolve, navalProfile };
})(globalThis);
