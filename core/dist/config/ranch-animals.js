"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cubMap = exports.animalMap = void 0;
const MCAnimalConfig_json_1 = __importDefault(require("../gameConfig/ranch/MCAnimalConfig.json"));
const MCAnimalMutation_json_1 = __importDefault(require("../gameConfig/ranch/MCAnimalMutation.json"));
exports.animalMap = new Map(MCAnimalConfig_json_1.default.map(row => [row.id, row]));
exports.cubMap = new Map([
    ...MCAnimalConfig_json_1.default.map(row => [row.cub_item_id, { ...row, giantCubItemId: 0 }]),
    ...MCAnimalMutation_json_1.default.map(row => [row.giant_cub_item_id, { ...exports.animalMap.get(row.animal_id), giantCubItemId: row.giant_cub_item_id }]),
]);
//# sourceMappingURL=ranch-animals.js.map