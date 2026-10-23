import type { MigrationConfig } from "../models/interfaces";

export type ConnectionSlots = Array<ToolBoxAPI.Connection | null>;

const environmentUrl = (url: string) => url.replace(/\/$/, "").toLowerCase();

export function getUnavailablePlaylistConnections(playlist: MigrationConfig[], slots: ConnectionSlots) {
    const linkedIds = new Set(slots.flatMap((connection) => connection ? [connection.id] : []));
    return playlist.flatMap((config, index) => {
        const missingIds = [...new Set([config.sourceConnectionId, ...(config.targetConnectionIds || [])]
            .filter((id): id is string => id !== undefined && !linkedIds.has(id)))];
        return missingIds.length ? [{ index, entityDisplayName: config.entityDisplayName, missingIds }] : [];
    });
}

export function resolveMigrationConnections(config: MigrationConfig, slots: ConnectionSlots) {
    const source = slots.findIndex((connection) => connection !== null && connection.id === config.sourceConnectionId);
    const targets = config.targetConnectionIds || [];
    if (source < 0) throw new Error("Select an available source connection.");
    if (targets.length < 1 || targets.length > 5 || new Set(targets).size !== targets.length) {
        throw new Error("Select between one and five distinct destination environments.");
    }
    const sourceConnection = slots[source]!;
    const targetSlots = targets.map((id) => {
        const slot = slots.findIndex((connection) => connection !== null && connection.id === id);
        if (slot < 0) throw new Error(`Destination connection is unavailable: ${id}`);
        if (environmentUrl(slots[slot]!.url) === environmentUrl(sourceConnection.url)) {
            throw new Error("Source and destination must be different environments.");
        }
        return slot;
    });
    if (new Set(targetSlots.map((slot) => environmentUrl(slots[slot]!.url))).size !== targetSlots.length) {
        throw new Error("Select each destination environment only once.");
    }
    return { source, targets: targetSlots };
}

export function assertConnectionsUnchanged(config: MigrationConfig, expected: ConnectionSlots, current: ConnectionSlots) {
    resolveMigrationConnections(config, current);
    for (const id of [config.sourceConnectionId, ...(config.targetConnectionIds || [])]) {
        const before = expected.find((connection) => connection?.id === id);
        const after = current.find((connection) => connection?.id === id);
        if (!before || !after || environmentUrl(before.url) !== environmentUrl(after.url) || expected.indexOf(before) !== current.indexOf(after)) {
            throw new Error("Connection assignments changed. Refresh connections and preview the migration again.");
        }
    }
}
