// https://developers.google.com/media/vp9/settings/vod

// TODO: Make a setting to change b:v, minrate, maxrate

function getBitrate(options) {
    const listBuilder = (bitrate, minBitrate, maxBitrate) => {
        return [
            `-b:v ${bitrate}k`,
            `-minrate ${minBitrate}k`,
            `-maxrate ${maxBitrate}k`
        ]
    }

    switch (options.resolution) {
        case 144:
        case 240:
            return listBuilder(150, 75, 218)
        case 360:
            return listBuilder(276, 138, 400)
        case 480:
            // 512 (LQ), 750 (MQ) |	256 (LQ) 375 (MQ)	| 742 (LQ) 1088 (MQ)
            return listBuilder(512, 256, 742)
        case 720:
            return listBuilder(1024, 512, 1485)
        case 1080:
            return listBuilder(1800, 900, 2610)
        case 1440:
            return listBuilder(6000, 3000, 8700)
        case 2160:
            return listBuilder(12000, 6000, 17400)
        default:
            console.error(`getBitrate: UNKNOWN VIDEO RESOLUTION: ${options.resolution}; USING 144p AS FALLBACK`)
            return listBuilder(150, 75, 218)
    }
}

function getQuality(options) {
    const listBuilder = (crf) => {
        return [`-crf ${crf}`]
    }

    switch (options.resolution) {
        case 144:
        case 240:
            return listBuilder(37)
        case 360:
            return listBuilder(36)
        case 480:
            // 34 (LQ) or 33 (MQ)
            return listBuilder(34)
        case 720:
            return listBuilder(32)
        case 1080:
            return listBuilder(31)
        case 1440:
            return listBuilder(24)
        case 2160:
            return listBuilder(15)
        default:
            console.error(`getQuality: UNKNOWN VIDEO RESOLUTION: ${options.resolution}; USING 144p AS FALLBACK`)
            return listBuilder(37)
    }
}

function getTileColumns(options) {
    const listBuilder = (tiles, threads) => {
        return [
            `-tile-columns ${tiles}`,
            `-threads ${threads}`
        ]
    }

    switch (options.resolution) {
        case 144:
        case 240:
            return listBuilder(0, 2)
        case 360:
            return listBuilder(1, 2 * 2)
        case 480:
            return listBuilder(1, 2 * 2)
        case 720:
            return listBuilder(2, 2 * 2)
        case 1080:
            return listBuilder(2, 2 * 2)
        case 1440:
            return listBuilder(4, 4 * 4)
        case 2160:
            return listBuilder(4, 4 * 4)
        default:
            console.error(`getTileColumns: UNKNOWN VIDEO RESOLUTION: ${options.resolution}; USING 2160p AS FALLBACK`)
            return listBuilder(4, 4 * 4)
    }
}

function builderVodFun(options, store) {
    let outputOptions = []
    let targetFps = options.fps

    if (store['isFramerateCapped']) {
        let targetFps = Math.min(options.fps, store['framerateCap'])
    }

    let keyFrameSpacing = store['keyFrameSpacing']

    outputOptions.push(`-r ${targetFps}`)
    outputOptions.push(`-g ${keyFrameSpacing}`)
    outputOptions.push(...getBitrate(options))
    outputOptions.push(...getQuality(options))
    outputOptions.push(...getTileColumns(options))

    return {
        outputOptions: outputOptions
    }
}

function returnOrDefault(value, defaultValue) {
    if (!Number.isInteger(value)) {
        console.error(`${value} is not an integer! Setting it to ${defaultKeyFrameSpacing}`)

        return defaultValue
    }
}

async function register({
                            registerSetting,
                            settingsManager,
                            transcodingManager
                        }) {
    const defaultKeyFrameSpacing = 240
    const defaultFramerateCap = 30
    const defaultIsFramerateCapped = true

    const store = {
        keyFrameSpacing: await settingsManager.getSetting('keyFrameSpacing') || defaultKeyFrameSpacing,
        framerateCap: await settingsManager.getSetting('framerateCap') || defaultFramerateCap,
        isFramerateCapped: await settingsManager.getSetting('isFramerateCapped') || defaultIsFramerateCapped,
    }

    const builderVOD = (options) => {
        return builderVodFun(options, store)
    }

    // registerSetting({
    //   name: 'crf',
    //   label: 'Quality',
    //   type: 'select',
    //   options: [
    //     { label: 'Default', value: 23 },
    //     { label: 'Good', value: 20 },
    //     { label: 'Very good', value: 17 },
    //     { label: 'Excellent', value: 14 }
    //   ],
    //   descriptionHTML: 'Increasing quality will result in bigger video sizes',
    //   private: true,
    //   default: defaultCRF
    // })

    registerSetting({
        name: 'keyFrameSpacing',
        label: 'Key frame spacing',
        type: 'input',
        descriptionHTML: `
It is recommended to allow up to 240 frames of video between keyframes (8 seconds for 30fps content).<br/>
Keyframes are video frames which are self-sufficient; they don't rely upon any other frames to render, but they tend to be larger than other frame types.<br/>
For web and mobile playback, generous spacing between keyframes allows the encoder to choose the best placement of keyframes to maximize quality.<br/>
<strong>INTEGERS ONLY. WILL RESET TO ${defaultKeyFrameSpacing} IF NOT INTEGER</strong>`,
        private: true,
        default: defaultKeyFrameSpacing,
    })

    registerSetting({
        name: 'isFramerateCapped',
        label: 'Cap video framerate',
        type: 'input-checkbox',
        descriptionHTML: `If checked, will cap framerate of video to value in plugin settings`,
        private: true,
        default: true,
    })

    registerSetting({
        name: 'framerateCap',
        label: 'Target video framerate',
        type: 'input',
        descriptionHTML: `Will cap video framerate if "Cap video framerate" is checked`,
        private: true,
        default: defaultFramerateCap,
    })

    let setParsedUIntOrDefault = (valueName, defaultValue, changedSettings) => {
        let changedValue = changedSettings[valueName].trim()
        let parsedValue = Number.parseInt(changedValue)

        if (!Number.isInteger(parsedValue) || parsedValue < 0) {
            console.error(`${valueName} is not a positive integer(${changedValue})! Setting it to ${defaultValue}`)

            parsedValue = defaultValue
        }

        store[valueName] = parsedValue

        settingsManager.setSetting(valueName, parsedValue.toString())
    }

    settingsManager.onSettingsChange(settings => {
        setParsedUIntOrDefault('keyFrameSpacing', defaultKeyFrameSpacing, settings)
        setParsedUIntOrDefault('framerateCap', defaultFramerateCap, settings)
    })

    const encoder = 'libvpx-vp9'
    const profileName = 'U2Be like VP9 transcoding'

    transcodingManager.addVODProfile(encoder, profileName, builderVOD)
    transcodingManager.addVODEncoderPriority('video', encoder, 1000)
    transcodingManager.addVODEncoderPriority('audio', 'libopus', 1000)
}

async function unregister() {
}

module.exports = {
    register,
    unregister
}
