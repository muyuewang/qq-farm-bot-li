"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const charity_routes_1 = require("./charity-routes");
const context_1 = require("./context");
const overview_routes_1 = require("./overview-routes");
const qingmei_routes_1 = require("./qingmei-routes");
const qixi_routes_1 = require("./qixi-routes");
const stellar_routes_1 = require("./stellar-routes");
const weather_routes_1 = require("./weather-routes");
const pet_diary_routes_1 = require("./pet-diary-routes");
function mountActivityCenterRoutes(app, ctx) {
    const routes = (0, context_1.createActivityRouteContext)(app, ctx);
    (0, overview_routes_1.mountActivityOverviewRoutes)(routes);
    (0, stellar_routes_1.mountStellarActivityRoutes)(routes);
    (0, qingmei_routes_1.mountQingMeiActivityRoutes)(routes);
    (0, qixi_routes_1.mountQixiActivityRoutes)(routes);
    (0, charity_routes_1.mountCharityActivityRoutes)(routes);
    (0, weather_routes_1.mountWeatherActivityRoutes)(routes);
    (0, pet_diary_routes_1.mountPetDiaryRoutes)(routes);
}
module.exports = { mountActivityCenterRoutes };
//# sourceMappingURL=index.js.map