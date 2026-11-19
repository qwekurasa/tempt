from pathlib import Path
from uuid import uuid5, NAMESPACE_DNS
import json, math, struct, zlib

root = Path(__file__).resolve().parent
sources = sorted((root / "Think/Sources").glob("*.swift"))
project_dir = root / "Think.xcodeproj"
project_dir.mkdir(exist_ok=True)

# Draw a clean 1024px app icon entirely with Python's standard library.
# This avoids external dependencies in the GitHub macOS runner.
asset = root / "Think/Assets.xcassets/AppIcon.appiconset"
asset.mkdir(parents=True, exist_ok=True)
(asset / "Contents.json").write_text(json.dumps({
    "images": [{"filename": "ThinkIcon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
    "info": {"author": "xcode", "version": 1}
}))
rgb = bytearray()
for y in range(1024):
    rgb.append(0)
    yn = (y - 512) / 400.0
    for x in range(1024):
        xn = (x - 512) / 400.0
        # A purple, slightly organic four-point spark.
        angle = math.atan2(yn, xn)
        radius = math.hypot(xn, yn)
        boundary = 0.24 + 0.34 * abs(math.cos(2 * angle)) ** 9
        star = radius < boundary
        # Thin graphite outline of a thought shape surrounding the spark.
        cx, cy = (x - 512) / 370.0, (y - 490) / 390.0
        ellipse = cx * cx + cy * cy
        outline = 0.985 < ellipse < 1.014 and y < 725
        neck = (685 < y < 850 and
                (abs(x - 455) < 5 or abs(x - 570) < 5 or
                 (y > 840 and 455 < x < 570)))
        if star:
            rgb.extend((173, 72, 230))
        elif outline or neck:
            rgb.extend((52, 52, 50))
        else:
            rgb.extend((255, 255, 254))
raw = zlib.compress(bytes(rgb), 9)
def png_chunk(tag, data):
    return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xffffffff)
(asset / "ThinkIcon.png").write_bytes(
    b"\x89PNG\r\n\x1a\n" +
    png_chunk(b"IHDR", struct.pack("!2I5B", 1024, 1024, 8, 2, 0, 0, 0)) +
    png_chunk(b"IDAT", raw) + png_chunk(b"IEND", b"")
)
(root / "Think/Assets.xcassets/Contents.json").write_text(json.dumps({"info":{"author":"xcode","version":1}}))

keys = {}
def id(key):
    if key not in keys:
        keys[key] = uuid5(NAMESPACE_DNS, "think-build-2026-" + key).hex[:24].upper()
    return keys[key]

def ref_list(names):
    return "(\n" + "".join("\t\t\t\t" + id(k) + " /* " + k + " */,\n" for k in names) + "\t\t\t)"

objects=[]
def add(key, isa, body):
    objects.append("\t\t" + id(key) + " /* " + key + " */ = {\n\t\t\tisa = " + isa + ";\n" + body + "\t\t};")

for file in sources:
    n = file.name
    add("file_"+n, "PBXFileReference", f'\t\t\tlastKnownFileType = sourcecode.swift; path = {n}; sourceTree = "<group>";\n')
    add("build_"+n, "PBXBuildFile", f'\t\t\tfileRef = {id("file_"+n)} /* {n} */;\n')
add("assets", "PBXFileReference", '\t\t\tlastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>";\n')
add("assets-build", "PBXBuildFile", f'\t\t\tfileRef = {id("assets")} /* assets */;\n')
add("app", "PBXFileReference", '\t\t\texplicitFileType = wrapper.application; includeInIndex = 0; path = Think.app; sourceTree = BUILT_PRODUCTS_DIR;\n')
add("root-group", "PBXGroup", f'\t\t\tchildren = {ref_list(["think-group","products-group"])};\n\t\t\tsourceTree = "<group>";\n')
add("products-group", "PBXGroup", f'\t\t\tchildren = {ref_list(["app"])};\n\t\t\tname = Products; sourceTree = "<group>";\n')
add("think-group", "PBXGroup", f'\t\t\tchildren = {ref_list(["sources-group","assets"])};\n\t\t\tpath = Think; sourceTree = "<group>";\n')
add("sources-group", "PBXGroup", f'\t\t\tchildren = {ref_list(["file_"+f.name for f in sources])};\n\t\t\tpath = Sources; sourceTree = "<group>";\n')
add("sources-phase", "PBXSourcesBuildPhase", f'\t\t\tbuildActionMask = 2147483647; files = {ref_list(["build_"+f.name for f in sources])};\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n')
add("assets-phase", "PBXResourcesBuildPhase", f'\t\t\tbuildActionMask = 2147483647; files = {ref_list(["assets-build"])};\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n')
add("frameworks-phase", "PBXFrameworksBuildPhase", '\t\t\tbuildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;\n')
add("target", "PBXNativeTarget", f'\t\t\tbuildConfigurationList = {id("target-configs")};\n\t\t\tbuildPhases = {ref_list(["sources-phase","frameworks-phase","assets-phase"])};\n\t\t\tbuildRules = (); dependencies = (); name = Think;\n\t\t\tproductName = Think;\n\t\t\tproductReference = {id("app")} /* Think.app */;\n\t\t\tproductType = "com.apple.product-type.application";\n')
add("project", "PBXProject", f'\t\t\tattributes = {{ LastUpgradeCheck = 1600; }};\n\t\t\tbuildConfigurationList = {id("project-configs")};\n\t\t\tcompatibilityVersion = "Xcode 14.0";\n\t\t\tdevelopmentRegion = ru;\n\t\t\thasScannedForEncodings = 0;\n\t\t\tknownRegions = (ru, en, Base);\n\t\t\tmainGroup = {id("root-group")};\n\t\t\tproductRefGroup = {id("products-group")};\n\t\t\tprojectDirPath = ""; projectRoot = "";\n\t\t\ttargets = {ref_list(["target"])};\n')
base = {
    "ALWAYS_SEARCH_USER_PATHS":"NO",
    "CLANG_ENABLE_MODULES":"YES",
    "CLANG_ENABLE_OBJC_ARC":"YES",
    "CODE_SIGN_STYLE":"Automatic",
    "IPHONEOS_DEPLOYMENT_TARGET":"17.0",
    "SDKROOT":"iphoneos",
    "SWIFT_VERSION":"5.0",
    "TARGETED_DEVICE_FAMILY":'"1,2"'
}
target = {
    "ASSETCATALOG_COMPILER_APPICON_NAME":"AppIcon",
    "CODE_SIGN_STYLE":"Automatic",
    "CURRENT_PROJECT_VERSION":"2",
    "GENERATE_INFOPLIST_FILE":"YES",
    "INFOPLIST_KEY_CFBundleDisplayName":"Think",
    "INFOPLIST_KEY_LSApplicationCategoryType":'"public.app-category.productivity"',
    "INFOPLIST_KEY_UIApplicationSceneManifest_Generation":"YES",
    "INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents":"YES",
    "INFOPLIST_KEY_UILaunchScreen_Generation":"YES",
    "INFOPLIST_KEY_NSMicrophoneUsageDescription":'"Think использует микрофон для записи идей голосом."',
    "INFOPLIST_KEY_NSSpeechRecognitionUsageDescription":'"Think превращает твою речь в текст идеи."',
    "IPHONEOS_DEPLOYMENT_TARGET":"17.0",
    "MARKETING_VERSION":"1.1",
    "PRODUCT_BUNDLE_IDENTIFIER":"com.think.ideas.personal",
    "PRODUCT_NAME":'"$(TARGET_NAME)"',
    "SUPPORTED_PLATFORMS":'"iphoneos iphonesimulator"',
    "SWIFT_EMIT_LOC_STRINGS":"YES",
    "SWIFT_VERSION":"5.0",
    "TARGETED_DEVICE_FAMILY":'"1,2"'
}
for prefix, settings in (("project", base), ("target",target)):
    for config in ("Debug", "Release"):
        lines = "".join("\t\t\t\t" + k + " = " + v + ";\n" for k,v in settings.items())
        lines += '\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = ' + ('"-Onone"' if config == "Debug" else '"-O"') + ';\n'
        add(prefix + "-" + config, "XCBuildConfiguration", f'\t\t\tbuildSettings = {{\n{lines}\t\t\t}};\n\t\t\tname = {config};\n')
for prefix in ("project","target"):
    add(prefix+"-configs","XCConfigurationList",f'\t\t\tbuildConfigurations = {ref_list([prefix+"-Debug",prefix+"-Release"])};\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n')
content = '// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {};\n\tobjectVersion = 56;\n\tobjects = {\n' + '\n'.join(objects) + '\n\t};\n\trootObject = ' + id("project") + ' /* Project */;\n}\n'
(project_dir / "project.pbxproj").write_text(content)
print("Generated Xcode project; Swift files:", len(sources))

scheme_path = project_dir / "xcshareddata/xcschemes/Think.xcscheme"
if scheme_path.exists():
    scheme_path.write_text(scheme_path.read_text().replace("TEMP_TARGET_ID", id("target")))
