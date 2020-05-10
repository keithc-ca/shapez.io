import { ExplainedResult } from "../core/explained_result";
import { createLogger } from "../core/logging";
import { ReadWriteProxy } from "../core/read_write_proxy";
import { globalConfig } from "../core/config";
import { Savegame } from "./savegame";
import { Math_floor } from "../core/builtins";

const logger = createLogger("savegame_manager");

const Rusha = require("rusha");

/** @enum {string} */
export const enumLocalSavegameStatus = {
    offline: "offline",
    synced: "synced",
};

/**
 * @typedef {{
 *   lastUpdate: number,
 *   version: number,
 *   internalId: string
 * }} SavegameMetadata
 *
 * @typedef {{
 *   version: number,
 *   savegames: Array<SavegameMetadata>
 * }} SavegamesData
 */

export class SavegameManager extends ReadWriteProxy {
    constructor(app) {
        super(app, "savegames.bin");

        /** @type {SavegamesData} */
        this.currentData = this.getDefaultData();
    }

    // RW Proxy Impl
    /**
     * @returns {SavegamesData}
     */
    getDefaultData() {
        return {
            version: this.getCurrentVersion(),
            savegames: [],
        };
    }

    getCurrentVersion() {
        return 1000;
    }

    /**
     * @returns {SavegamesData}
     */
    getCurrentData() {
        return super.getCurrentData();
    }

    verify(data) {
        // TODO / FIXME!!!!
        return ExplainedResult.good();
    }

    /**
     *
     * @param {SavegamesData} data
     */
    migrate(data) {
        return ExplainedResult.good();
    }

    // End rw proxy

    /**
     * @returns {Array<SavegameMetadata>}
     */
    getSavegamesMetaData() {
        return this.currentData.savegames;
    }

    /**
     *
     * @param {string} internalId
     * @returns {Savegame}
     */
    getSavegameById(internalId) {
        const metadata = this.getGameMetaDataByInternalId(internalId);
        if (!metadata) {
            return null;
        }
        return new Savegame(this.app, { internalId, metaDataRef: metadata });
    }

    /**
     * Deletes a savegame
     * @param {SavegameMetadata} game
     */
    deleteSavegame(game) {
        const handle = new Savegame(this.app, {
            internalId: game.internalId,
            metaDataRef: game,
        });

        return handle.deleteAsync().then(() => {
            for (let i = 0; i < this.currentData.savegames.length; ++i) {
                const potentialGame = this.currentData.savegames[i];
                if (potentialGame.internalId === handle.internalId) {
                    this.currentData.savegames.splice(i, 1);
                    break;
                }
            }

            return this.writeAsync();
        });
    }

    /**
     * Returns a given games metadata by id
     * @param {string} id
     * @returns {SavegameMetadata}
     */
    getGameMetaDataByInternalId(id) {
        for (let i = 0; i < this.currentData.savegames.length; ++i) {
            const data = this.currentData.savegames[i];
            if (data.internalId === id) {
                return data;
            }
        }
        logger.error("Savegame internal id not found:", id);
        return null;
    }

    /**
     * Creates a new savegame
     * @returns {Savegame}
     */
    createNewSavegame() {
        const id = this.generateInternalId();

        const metaData = /** @type {SavegameMetadata} */ ({
            lastUpdate: Date.now(),
            version: Savegame.getCurrentVersion(),
            internalId: id,
        });

        this.currentData.savegames.push(metaData);
        this.sortSavegames();

        return new Savegame(this.app, {
            internalId: id,
            metaDataRef: metaData,
        });
    }

    /**
     * Sorts all savegames by their creation time descending
     * @returns {Promise<any>}
     */
    sortSavegames() {
        this.currentData.savegames.sort((a, b) => b.lastUpdate - a.lastUpdate);
        let promiseChain = Promise.resolve();
        while (this.currentData.savegames.length > 100) {
            const toRemove = this.currentData.savegames.pop();

            // Try to remove the savegame since its no longer available
            const game = new Savegame(this.app, {
                internalId: toRemove.internalId,
                metaDataRef: toRemove,
            });
            promiseChain = promiseChain
                .then(() => game.deleteAsync())
                .then(
                    () => {},
                    err => {
                        logger.error(this, "Failed to remove old savegame:", toRemove, ":", err);
                    }
                );
        }

        return promiseChain;
    }

    /**
     * Helper method to generate a new internal savegame id
     */
    generateInternalId() {
        const timestamp = ("" + Math_floor(Date.now() / 1000.0 - 1565641619)).padStart(10, "0");
        return (
            timestamp +
            "." +
            Rusha.createHash()
                .update(Date.now() + "/" + Math.random())
                .digest("hex")
        );
    }

    // End

    initialize() {
        // First read, then directly write to ensure we have the latest data
        // @ts-ignore
        return this.readAsync().then(() => {
            if (G_IS_DEV && globalConfig.debug.disableSavegameWrite) {
                return Promise.resolve();
            }
            return this.writeAsync();
        });
    }
}