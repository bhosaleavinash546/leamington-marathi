/**
 * Software costing studio (Chief Engineer review, Oct 2026): the SUV skeleton, the step-by-step costing and the
 * COCOMO schedule. The map carries no money; the steps read every figure off the engine's result.
 */
import { describe, it, expect } from 'vitest';
import { SW_MODULES, computeSWProgram, defaultSWProgramInputs, applyPowertrainScope } from '../src/engine/sw-should-cost.js';
import { SW_MODULE_COMPONENTS, SW_VEHICLE_COMPONENTS, componentsForModule, vehicleComponent } from '../src/engine/sw-vehicle-map.js';
import { swCostingSteps } from '../src/engine/sw-costing-steps.js';
import { cocomoTdevMonths, swSchedule } from '../src/engine/sw-schedule.js';
import { componentLoad, renderVehicleSkeletonSVG } from '../src/ui/panels/sw-vehicle-skeleton.js';
import { skeletonStateFor } from '../src/ui/panels/sw-costing-pipeline.js';

const fmt = { money: (n: number) => `£${Math.round(n)}`, number: (n: number, dp = 0) => n.toFixed(dp) };

describe('vehicle map', () => {
  it('every module is placed on the vehicle, and every placement is a real component', () => {
    for (const m of SW_MODULES) expect(SW_MODULE_COMPONENTS[m.id]?.length, m.id).toBeGreaterThan(0);
    for (const ids of Object.values(SW_MODULE_COMPONENTS)) for (const id of ids) expect(vehicleComponent(id), id).toBeDefined();
    expect(new Set(SW_VEHICLE_COMPONENTS.map(c => c.id)).size).toBe(SW_VEHICLE_COMPONENTS.length);
  });
  it('components follow the drivetrain: an ICE has no battery, a BEV no engine', () => {
    expect(componentsForModule('bms_core', 'ICE')).toEqual([]);
    expect(componentsForModule('engine_control', 'BEV')).toEqual([]);
    expect(componentsForModule('bms_core', 'BEV').map(c => c.id)).toContain('battery_pack');
    expect(componentsForModule('regen_braking', 'PHEV').map(c => c.id)).toEqual(['brake_system', 'rear_edu']);
  });
  it('a component lists the modules on it with their engine costs; nothing is allocated', () => {
    const r = computeSWProgram(defaultSWProgramInputs());
    const load = componentLoad(skeletonStateFor(r));
    const adas = load.get('adas_dc')!;
    const expected = r.modules.filter(m => SW_MODULE_COMPONENTS[m.moduleId].includes('adas_dc'));
    expect(adas.modules.map(m => m.id).sort()).toEqual(expected.map(m => m.moduleId).sort());
    expect(adas.cost).toBeCloseTo(expected.reduce((a, m) => a + m.grandTotal, 0), 6);
  });
  it('the SVG is keyboard-reachable and names each component with its modules', () => {
    const r = computeSWProgram(defaultSWProgramInputs());
    const svg = renderVehicleSkeletonSVG({ ...skeletonStateFor(r), focusModules: ['camera_perception'] }, fmt.money);
    expect(svg).toMatch(/role="group" aria-label="SUV top view/);
    expect(svg).toMatch(/data-comp="front_camera"[^>]*swv-lit|class="swv-comp swv-k-sensor swv-lit"[^>]*data-comp="front_camera"/);
    expect(svg).toMatch(/aria-label="Front camera \(windscreen\): 1 software module \(Camera Perception Stack\)/);
    expect(svg).not.toMatch(/data-comp="engine"/);            // default programme is a BEV scope
  });
});

describe('costing steps', () => {
  it('seven steps, every figure read off the result', () => {
    const p = applyPowertrainScope(defaultSWProgramInputs().modules, 'BEV');
    const r = computeSWProgram({ ...defaultSWProgramInputs(), modules: p, powertrain: 'BEV' });
    const steps = swCostingSteps(r, { perPMGBP: 7000, hubLabel: 'United Kingdom', build: 'x' }, fmt);
    expect(steps.map(s => s.id)).toEqual(['scope', 'effort', 'verification', 'rate', 'nre', 'lifecycle', 'per-vehicle']);
    expect(steps[1].value).toBe(`${r.summary.totalPersonMonths.toFixed(0)} PM`);
    expect(steps[4].value).toBe(fmt.money(r.summary.nreTotal));
    expect(steps[6].value).toBe(fmt.money(r.summary.perVehicle));
    expect(steps[1].modules.every(id => ['C', 'D'].includes(r.modules.find(m => m.moduleId === id)!.asilUsed))).toBe(true);
  });
});

describe('schedule (COCOMO II.2000)', () => {
  it('reproduces the manual\'s worked example: 586.6 PM at E = 1.15 → 29.7 months', () => {
    expect(cocomoTdevMonths(586.6, 1.15)).toBeCloseTo(29.7, 1);
  });
  it('average team is effort over the DEVELOPMENT window, not the production life (code review F7)', () => {
    const r = computeSWProgram(defaultSWProgramInputs());
    const s = swSchedule(r);
    expect(s.averageTeam).toBeCloseTo(r.summary.totalEffortPersonMonths / 90, 6);
    expect(s.rows[0].tdevMonths).toBe(s.longestMonths);
    expect(s.rows.every(x => x.avgStaff > 0)).toBe(true);
  });
});
