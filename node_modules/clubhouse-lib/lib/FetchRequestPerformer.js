"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var cross_fetch_1 = require("cross-fetch");
var FetchRequestPerformer = /** @class */ (function () {
    function FetchRequestPerformer() {
        this.performRequest = cross_fetch_1.default;
    }
    return FetchRequestPerformer;
}());
exports.default = FetchRequestPerformer;
