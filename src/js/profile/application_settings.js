/* typehints:start */
import { Application } from "../application";
/* typehints:end */

import { ReadWriteProxy } from "../core/read_write_proxy";
import { BoolSetting, EnumSetting, BaseSetting } from "./setting_types";
import { createLogger } from "../core/logging";
import { ExplainedResult } from "../core/explained_result";

const logger = createLogger("application_settings");

const categoryGame = "game";
const categoryApp = "app";

export const uiScales = [
    {
        id: "super_small",
        size: 0.6,
        label: "Super small",
    },
    {
        id: "small",
        size: 0.8,
        label: "Small",
    },
    {
        id: "regular",
        size: 1,
        label: "Regular",
    },
    {
        id: "large",
        size: 1.2,
        label: "Large",
    },
    {
        id: "huge",
        size: 1.4,
        label: "Huge",
    },
];

/** @type {Array<BaseSetting>} */
export const allApplicationSettings = [
    new EnumSetting("uiScale", {
        options: uiScales.sort((a, b) => a.size - b.size),
        valueGetter: scale => scale.id,
        textGetter: scale => scale.label,
        category: categoryApp,
        restartRequired: false,
        changeCb:
            /**
             * @param {Application} app
             */
            (app, id) => app.updateAfterUiScaleChanged(),
    }),
    new BoolSetting(
        "fullscreen",
        categoryApp,
        /**
         * @param {Application} app
         */
        (app, value) => {
            if (app.platformWrapper.getSupportsFullscreen()) {
                app.platformWrapper.setFullscreen(value);
            }
        },
        G_IS_STANDALONE
    ),

    // GAME
];

export function getApplicationSettingById(id) {
    return allApplicationSettings.find(setting => setting.id === id);
}

class SettingsStorage {
    constructor() {
        this.uiScale = "regular";
        this.fullscreen = G_IS_STANDALONE;
    }
}

export class ApplicationSettings extends ReadWriteProxy {
    constructor(app) {
        super(app, "app_settings.bin");
    }

    initialize() {
        // Read and directly write latest data back
        return this.readAsync().then(() => this.writeAsync());
    }

    save() {
        return this.writeAsync();
    }

    // Getters

    /**
     * @returns {SettingsStorage}
     */
    getAllSettings() {
        return this.getCurrentData().settings;
    }

    /**
     * @param {string} key
     */
    getSetting(key) {
        assert(this.getAllSettings().hasOwnProperty(key), "Setting not known: " + key);
        return this.getAllSettings()[key];
    }

    getInterfaceScaleId() {
        if (!this.currentData) {
            // Not initialized yet
            return "regular";
        }
        return this.getAllSettings().uiScale;
    }

    getInterfaceScaleValue() {
        const id = this.getInterfaceScaleId();
        for (let i = 0; i < uiScales.length; ++i) {
            if (uiScales[i].id === id) {
                return uiScales[i].size;
            }
        }
        logger.error("Unknown ui scale id:", id);
        return 1;
    }

    getIsFullScreen() {
        return this.getAllSettings().fullscreen;
    }

    // Setters

    /**
     * @param {string} key
     * @param {string|boolean} value
     */
    updateSetting(key, value) {
        assert(this.getAllSettings().hasOwnProperty(key), "Setting not known: " + key);
        this.getAllSettings()[key] = value;
        return this.writeAsync();
    }

    // RW Proxy impl
    verify(data) {
        if (!data.settings) {
            return ExplainedResult.bad("missing key 'settings'");
        }
        if (typeof data.settings !== "object") {
            return ExplainedResult.bad("Bad settings object");
        }

        const settings = data.settings;
        for (let i = 0; i < allApplicationSettings.length; ++i) {
            const setting = allApplicationSettings[i];
            const storedValue = settings[setting.id];
            if (!setting.validate(storedValue)) {
                return ExplainedResult.bad("Bad setting value for " + setting.id + ": " + storedValue);
            }
        }
        return ExplainedResult.good();
    }

    getDefaultData() {
        return {
            version: this.getCurrentVersion(),
            settings: new SettingsStorage(),
        };
    }

    getCurrentVersion() {
        return 1;
    }

    migrate(data) {
        // Simply reset
        if (data.version < 1) {
            data.settings = new SettingsStorage();
            data.version = 1;
        }

        return ExplainedResult.good();
    }
}