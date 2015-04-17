var fs = require('fs');
var path = require('path');

module.exports = function(context) {
    var ConfigParser = context.requireCordovaModule('cordova-lib').configparser;
    var Q = context.requireCordovaModule('q');
    var xcode = context.requireCordovaModule('xcode');

    var platforms = context.opts.platforms;

    if (platforms.indexOf('android') !== -1) {
        var androidPluginConfig = require('../../android.json');

        var androidApiKey = androidPluginConfig.installed_plugins['org.apache.cordova.crashlytics'].CRASHLYTICS_API_KEY;
        var androidApiSecret = androidPluginConfig.installed_plugins['org.apache.cordova.crashlytics'].CRASHLYTICS_API_SECRET;

        var crashlyticsProperties = '';
        crashlyticsProperties += 'apiKey=' + androidApiKey + '\n';
        crashlyticsProperties += 'apiSecret=' + androidApiSecret + '\n';

        fs.writeFileSync('platforms/android/crashlytics.properties', crashlyticsProperties);

        var buildGradlePath = path.join('platforms', 'android', 'build.gradle');
        var buildGradle = fs.readFileSync(buildGradlePath, 'utf8');

        var buildGradleExtra =  '// CRASHLYTICS PLUGIN EXTRAS START\n' +
                                'buildscript {\n' +
                                '    repositories {\n' +
                                '        maven { url \'http://download.crashlytics.com/maven\' }\n' +
                                '    }\n' +
                                '    dependencies {\n' +
                                '        classpath \'com.crashlytics.tools.gradle:crashlytics-gradle:1.+\'\n' +
                                '    }\n' +
                                '}\n' +
                                '// CRASHLYTICS PLUGIN EXTRAS END\n';

        buildGradle = buildGradle.replace(/\/\/ CRASHLYTICS PLUGIN EXTRAS START[\s\S]*\/\/ CRASHLYTICS PLUGIN EXTRAS END/, '');
        buildGradle += buildGradleExtra;

        fs.writeFileSync(buildGradlePath, buildGradle);
    }

    if (platforms.indexOf('ios') !== -1) {
        var config = new ConfigParser('config.xml');
        var appName = config.name();

        var xcodeProjectPath = path.join('platforms', 'ios', appName + '.xcodeproj', 'project.pbxproj');
        var xcodeProject = xcode.project(xcodeProjectPath);

        var iosPluginConfig = require('../../ios.json');

        var iosApiKey = iosPluginConfig.installed_plugins['org.apache.cordova.crashlytics'].CRASHLYTICS_API_KEY;
        var iosApiSecret = iosPluginConfig.installed_plugins['org.apache.cordova.crashlytics'].CRASHLYTICS_API_SECRET;

        var deferral = new Q.defer();

        xcodeProject.parse(function(err) {
            if (err) {
                throw err;
            }

            var comment = 'Crashlytics run';

            for (var shellScriptBuildPhaseId in xcodeProject.hash.project.objects.PBXShellScriptBuildPhase) {
                var deleteShellScriptBuildPhaseId = false;

                if (shellScriptBuildPhaseId.indexOf('_comment') !== -1) {
                    deleteShellScriptBuildPhaseId = (xcodeProject.hash.project.objects.PBXShellScriptBuildPhase[shellScriptBuildPhaseId] === comment);
                } else {
                    deleteShellScriptBuildPhaseId = (xcodeProject.hash.project.objects.PBXShellScriptBuildPhase[shellScriptBuildPhaseId].name.indexOf(comment) !== -1);
                }

                if (deleteShellScriptBuildPhaseId) {
                    delete xcodeProject.hash.project.objects.PBXShellScriptBuildPhase[shellScriptBuildPhaseId];
                }
            }

            var id = xcodeProject.generateUuid();

            xcodeProject.hash.project.objects.PBXShellScriptBuildPhase[id] = {
                isa: 'PBXShellScriptBuildPhase',
                buildActionMask: 2147483647,
                files: [],
                inputPaths: [],
                name: '"' + comment + '"',
                outputPaths: [],
                runOnlyForDeploymentPostprocessing: 0,
                shellPath: '/bin/sh',
                shellScript: '"../../plugins/org.apache.cordova.crashlytics/libs/ios/Crashlytics.framework/run ' + iosApiKey + ' ' + iosApiSecret + '"',
                showEnvVarsInLog: 0
            };

            xcodeProject.hash.project.objects.PBXShellScriptBuildPhase[id + '_comment'] = comment;

            for (var nativeTargetId in xcodeProject.hash.project.objects.PBXNativeTarget) {
                if (nativeTargetId.indexOf('_comment') === -1) {

                    xcodeProject.hash.project.objects.PBXNativeTarget[nativeTargetId].buildPhases = xcodeProject.hash.project.objects.PBXNativeTarget[nativeTargetId].buildPhases.filter(function(value) {
                        return (value.comment !== comment);
                    });

                    xcodeProject.hash.project.objects.PBXNativeTarget[nativeTargetId].buildPhases.push({
                        value: id,
                        comment: comment
                    });
                }
            }

            fs.writeFileSync(xcodeProjectPath, xcodeProject.writeSync());

            deferral.resolve();
        });

        return deferral.promise;
    }
};