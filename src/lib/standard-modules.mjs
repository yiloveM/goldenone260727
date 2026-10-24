export function validateModuleLibrary(modules) {
    const byId = new Map();
    for (const m of modules) {
        if (byId.has(m.id))
            throw new Error('Duplicate standard module: ' + m.id);
        byId.set(m.id, m);
        if (!Number.isSafeInteger(m.revision) || m.revision < 1)
            throw new Error('Invalid module revision: ' + m.id);
    }
    const visiting = new Set(), done = new Set();
    function visit(id) { if (visiting.has(id))
        throw new Error('Cyclic module dependency: ' + id); if (done.has(id))
        return; const m = byId.get(id); if (!m)
        throw new Error('Unknown module dependency: ' + id); visiting.add(id); for (const dep of [...(m.requiresModules || []), ...(m.mustComeAfter || [])])
        visit(dep); visiting.delete(id); done.add(id); }
    for (const m of modules)
        visit(m.id);
    return byId;
}
export function validateModuleSequence(items, modules) { const byId = validateModuleLibrary(modules), positions = new Map(items.map((m, i) => [m.id, i])); for (const [i, item] of items.entries()) {
    const def = byId.get(item.id);
    if (!def)
        throw new Error('Unknown module: ' + item.id);
    for (const dep of def.requiresModules || [])
        if (!positions.has(dep))
            throw new Error(`${item.id} requires ${dep}`);
    for (const dep of def.mustComeAfter || [])
        if (positions.has(dep) && positions.get(dep) >= i)
            throw new Error(`${item.id} must follow ${dep}`);
} return true; }
