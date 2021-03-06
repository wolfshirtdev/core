#!/usr/bin/env node
"use strict";

require("amd-loader");
try {
    require("heapdump");
} catch(e) {}

var path = require("path");
var architect = require("architect");
var optimist = require("optimist");

if (process.version.match(/^v0/) && parseFloat(process.version.substr(3)) < 10) {
    console.warn("You're using Node.js version " + process.version 
        + ". Version 0.10 or higher is recommended. Some features will not work.");
}

var DEFAULT_CONFIG = "s";
var DEFAULT_SETTINGS = getDefaultSettings();

var shortcuts = {
    "dev"  : ["ide", "preview", "vfs", "api", "sapi", "proxy", "redis", "account", "oldclient", "homepage", "apps-proxy", "-s", "devel"],
    "odev" : ["ide", "preview", "vfs", "api", "proxy", "oldclient", "homepage", "apps-proxy", "worker", "-s", "onlinedev"],
    "bill" : ["ide", "preview", "vfs", "api", "proxy", "oldclient", "homepage", "apps-proxy", "account", "-s", "billing"],
    "beta" : ["ide", "preview", "vfs", "proxy", "-s", "beta"],
    "ci"   : ["ide", "preview", "vfs", "proxy", "-s", "ci"],
    "s"    : ["standalone", "-s", "standalone"]
};

module.exports = main;

if (!module.parent)
    main(process.argv.slice(2));

function getDefaultSettings() {
    var hostname = require("os").hostname();
    
    var suffix = hostname.trim().split("-").pop() || "";
    var modes = {
        "prod": "deploy",
        "beta": "beta",
        "dev": "devel",
        "onlinedev": "onlinedev"
    };
    return modes[suffix] || "devel";
}

module.exports.getDefaultSettings = getDefaultSettings;

function main(argv, config, callback) {
    var options = optimist(argv)
        .usage("Usage: $0 [CONFIG_NAME] [--help]")
        .alias("s", "settings")
        .default("settings", DEFAULT_SETTINGS)
        .describe("settings", "Settings file to use")
        .describe("dump", "dump config file as JSON")
        .boolean("help")
        .describe("help", "Show command line options.");

    var configs = options.argv._;
    if (!configs.length) 
        configs = [config || DEFAULT_CONFIG];
        
    configs.forEach(function(config) {
        if (shortcuts[config]) {
            return main(shortcuts[config].concat(argv.filter(function(arg) {
                return arg != config;
            })), null, callback);
        }
        else {
            start(config, options, callback);
        }
    });
}

function start(configName, options, callback) {
    var argv = options.argv;
    var settingsName = argv.settings;
    
    if (typeof settingsName != "string")
        settingsName = settingsName.pop();
    
    var configPath = configName;
    if (configPath[0] !== "/")
        configPath = path.join(__dirname, "/configs/", configName);
   
    var settings = require(path.join(__dirname, "./settings", settingsName))();
    
    var plugins = require(configPath)(settings, options);
    
    if (argv.help) {
        options.usage("Usage: $0 " + configName);
        options.showHelp();
    }
    
    if (!plugins)
        return;
    
    if (module.exports.onResolvePlugins)
        module.exports.onResolvePlugins(plugins, __dirname + "/plugins");
    
    architect.resolveConfig(plugins, __dirname + "/plugins", function(err, config) {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        
        if (argv.dump) {
            console.log(JSON.stringify(config, null, 2));
            return callback && callback(null, config);
        }
        
        if (argv._getConfig)
            return callback && callback(null, config);

        var app = architect.createApp(config, function (err, app) {
            if (err) {
                console.trace("Error while starting '%s':", configPath);
                console.log(err, err.stack);
                process.exit(1);
            }
            console.log("Started '%s' with config '%s'!", configPath, settingsName);
            
            callback && callback(null, app);
        });
        
        app.on("service", function(name, plugin) {
            if (typeof plugin !== "function")
                plugin.name = name; 
        });
    });
}
