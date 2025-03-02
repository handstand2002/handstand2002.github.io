let animationId;
let startTime;
let requestFrameRate;
let actualFrameRate;
let ctxBackground;
let currentColors;

// palettes from https://www.heavy.ai/blog/12-color-palettes-for-telling-better-stories-with-your-data
const defaultPalette = 'river-nights'
const colorPalettes = {
  'river-nights':   ["#b30000", "#7c1158", "#4421af", "#1a53ff", "#0d88e6", "#00b7c7", "#5ad45a", "#8be04e", "#ebdc78"],
  'dutch-field':    ["#e60049", "#0bb4ff", "#50e991", "#e6d800", "#9b19f5", "#ffa300", "#dc0ab4", "#b3d4ff", "#00bfa0"],
  'retro-metro':    ["#ea5545", "#f46a9b", "#ef9b20", "#edbf33", "#ede15b", "#bdcf32", "#87bc45", "#27aeef", "#b33dc6"],
  'spring-pastels': ["#fd7f6f", "#7eb0d5", "#b2e061", "#bd7ebe", "#ffb55a", "#ffee65", "#beb9db", "#fdcce5", "#8bd3c7"]
}

const frames = [];
const canvas = document.getElementById('diagramCanvas');
const ctx = canvas.getContext('2d');

const yamlInput = document.getElementById("yamlInput");
const yamlDefaultsDisplay = document.getElementById("yamlDefaultsDisplay");
const yamlText = () => yamlInput.value;

const VALID_MODES = [
  {name: "PLAIN", parse: parsePlain},
  {name: "STEP", parse: parseStep}
]

function preProcessElements(elements, anchors) {
  let i = 0;
  elements.forEach(el => {
      el.defineOrder = i++
      // Validate against expected properties
      applyAnchorPositionToObj(el, anchors)
      setDefaults(el, EXPECTED_PROPERTIES.object, "object.");
      warnUnexpectedProps(el, EXPECTED_PROPERTIES.object, "object.");
      errorMissingRequiredProps(el, EXPECTED_PROPERTIES.object, "object.")
      errorExtraneousProps(el, EXPECTED_PROPERTIES.object, "object.")
      applyTransforms(el, EXPECTED_PROPERTIES.object, "object.")
  });
}

function applyAnchorPositionToObj(el, anchors) {
  if (typeof el.position.anchor === 'undefined') {
    return
  }
  let anchor = findAnchor(el.position.anchor, anchors)
  if (typeof anchor !== 'undefined') {
    if (typeof el.position.x === 'undefined') {
      el.position.x = anchor.x
    }
    if (typeof el.position.y === 'undefined') {
      el.position.y = anchor.y
    }
  }
}

function applyAnchorPositionToTransition(tr, anchors) {
  if (typeof (tr.position || {})['anchor.start'] !== 'undefined') {
    let anchor = findAnchor(tr.position['anchor.start'], anchors)
    if (typeof anchor !== 'undefined') {
      if (typeof tr.position['x.start'] === 'undefined') {
        tr.position['x.start'] = anchor.x
      }
      if (typeof tr.position['y.start'] === 'undefined') {
        tr.position['y.start'] = anchor.y
      }
    }
  }
  if (typeof (tr.position || {})['anchor.end'] !== 'undefined') {
    let anchor = findAnchor(tr.position['anchor.end'], anchors)
    if (typeof anchor !== 'undefined') {
      if (typeof tr.position['x.end'] === 'undefined') {
        tr.position['x.end'] = anchor.x
      }
      if (typeof tr.position['y.end'] === 'undefined') {
        tr.position['y.end'] = anchor.y
      }
    }
  }
}

function findAnchor(name, allAnchors) {
  for (key in allAnchors) {
    let anchor = allAnchors[key]
    if (anchor.name == name) {
      return anchor
    }
  }
  return null
}

function preProcessTransition(tr, anchors, transitionTemplates) {
// TODO: make extraneous properties display warnings

  // apply templates if they exist
  if (Array.isArray(tr.templates) && tr.templates.length > 0) {
    for (idx in tr.templates) {
      let useTemplateName = tr.templates[idx]
      if (typeof useTemplateName != "string") {
        console.error("Expected a template name but instead found " + (typeof useTemplateName), useTemplateName)
        throw new Error("Expected a template name but instead found " + (typeof useTemplateName))
      }
      let template = findTemplate(transitionTemplates, useTemplateName)
      if (typeof template == 'undefined') {
        throw new Error("Could not find template " + useTemplateName)
      }
      applyTransitionTemplate(template, tr)
    }
  }

  applyAnchorPositionToTransition(tr, anchors)
  setDefaults(tr, EXPECTED_PROPERTIES.transition, "transition.");
//  warnUnexpectedProps(tr, EXPECTED_PROPERTIES.transition, "transition.");
//  errorMissingRequiredProps(tr, EXPECTED_PROPERTIES.transition, "transition.")
//  errorExtraneousProps(tr, EXPECTED_PROPERTIES.transition, "transition.")
  applyTransforms(tr, EXPECTED_PROPERTIES.transition, "transition.")
}

function applyTransitionTemplate(template, transition) {
  for (key in template) {
    if (key == 'name') {
      continue
    }
    applyTemplateValues(template, transition, key)
  }
}

function applyTemplateValues(template, objToApplyTo, key) {
  if (typeof template[key] == 'object') {
    if (typeof objToApplyTo[key] == 'undefined') {
      objToApplyTo[key] = {}
    }
    for (subKey in template[key]) {
      applyTemplateValues(template[key], objToApplyTo[key], subKey)
    }
  } else {
    if (typeof objToApplyTo[key] == 'undefined') {
      objToApplyTo[key] = template[key]
    }
  }
}

function findTemplate(templates, nameToFind) {
  for (idx in templates) {
    let t = templates[idx]
    if (t.name == nameToFind) {
      return t;
    }
  }
}

function parsePlain(doc) {
  let elements = doc.objects || [];
  let anchors = doc.anchors || [];
  let transitions = doc.transitions || [];
  let transitionTemplates = (doc.template || {}).transition || []
  preProcessElements(elements, anchors);

  transitions.forEach(tr => {
    // Validate transitions against expected properties
    preProcessTransition(tr, anchors, transitionTemplates)
  });
  return {elements: elements, transitions: transitions}
}

function getStepConfig(doc) {
  let config = (doc.config || {}).step || {}
  if (typeof config !== 'object') {
    config = {}
  }
  let durationConfig = config.duration || {}
  let intervalConfig = config.interval || {}
  return {
    duration: {
      default: durationConfig.default || 1000,
      max: durationConfig.max || 2000,
      objCountCoefficient: durationConfig.objCountCoefficient || 1.2
    },
    interval: {
      default: intervalConfig.default || 1000,
      max: intervalConfig.max || 2000,
      /* The more objects that are moved in the preceding step, the longer the interval is
         between steps - to give viewers more time to grok */
      objCountCoefficient: intervalConfig.objCountCoefficient || 1.2
    }
  }
}

function parseStep(doc) {
  let elements = doc.objects || [];
  let steps = doc.steps || [];
  let anchors = doc.anchors || [];
  let transitionTemplates = (doc.template || {}).transition || [];
  let config = getStepConfig(doc);

  preProcessElements(elements, anchors);

  let transitions = [];
  let nextTransitionStart = config.interval.default

  steps.forEach(st => {
    let stepTransitions = st.transitions || []
    transitionEnd = nextTransitionStart + calculateTransitionEnd(config.duration, stepTransitions.length)

    stepTransitions.forEach(tr => {
      if (typeof tr.timeStart !== 'undefined') {
        throw new Error("timeStart not valid for step mode")
      }
      if (typeof tr.timeEnd !== 'undefined') {
        throw new Error("timeEnd not valid for step mode")
      }
      tr.timeStart = nextTransitionStart
      tr.timeEnd = transitionEnd
      preProcessTransition(tr, anchors, transitionTemplates)
      transitions.push(tr)
    })
    let durationFromCoefficient = config.interval.default * Math.pow(config.interval.objCountCoefficient, stepTransitions.length-1)
    nextTransitionStart = transitionEnd + Math.min(durationFromCoefficient, config.interval.max)
  })

  return {elements: elements, transitions: transitions}
}

function calculateTransitionEnd(durationConfig, objCount) {
  let durationFromCoefficient = durationConfig.default * Math.pow(durationConfig.objCountCoefficient, objCount-1)
  let effectiveDuration = Math.min(durationFromCoefficient, durationConfig.max)
  return effectiveDuration
}

const EXPECTED_PROPERTIES = {
    object: {
        name: { required: true },
        icon: {
            shape: { required: true },
            outline: {
                thickness: { default: 1 },
                color: { default: "black", transform: c => normalizeColor(c) }
            },
            color: { default: "black", transform: c => normalizeColor(c) },
            size: { default: 50, allowed: (i) => ['star', 'cat', 'dog'].indexOf(i.icon?.shape) != -1}, // Optional, depending on the shape type
            width: { default: 50, allowed: (i) => ['rectangle', 'cloud', 'database', 'line', 'line-arrow', 'arrow'].indexOf(i.icon?.shape) != -1 },
            height: { default: 50, allowed: (i) => ['rectangle', 'cloud', 'database', 'line', 'line-arrow', 'arrow'].indexOf(i.icon?.shape) != -1 }
        },
        position: {
            x: { default: 0 },
            y: { default: 0 },
            z: { default: 1000 },
            anchor: { required: false } /* may be used instead of x,y */
        },
        label: {
            offsetX: { default: 10 },
            offsetY: { default: 10 },
            font: { default: '14px Arial' },
            style: { default: 'normal' },
            color: { default: 'black', transform: c => normalizeColor(c) },
            value: { default: '' }
        }
    },
    transition: {
        name: { required: true },
        timeStart: { required: true },
        timeEnd: { required: true },
        strategy: { default: 'cosine' },
        position: {
            'x.start': { required: false },
            'x.end': { required: false },
            'y.start': { required: false },
            'y.end': { required: false },
            'z.start': { required: false },
            'z.end': { required: false },
            'anchor.start': { required: false },
            'anchor.end': { required: false },
        },
        label: {
            'offsetX.start': { required: false },
            'offsetX.end': { required: false },
            'offsetY.start': { required: false },
            'offsetY.end': { required: false },
            'color.start': { required: false, transform: c => normalizeColor(c) },
            'color.end': { required: false, transform: c => normalizeColor(c) }
        },
        icon: {
            'color.start': { required: false, transform: c => normalizeColor(c) },
            'color.end': { required: false, transform: c => normalizeColor(c) },
            'size.start': { required: false },
            'size.end': { required: false },
            'height.start': { required: false },
            'height.end': { required: false },
            'width.start': { required: false },
            'width.end': { required: false },
            outline: {
                'thickness.start': { required: false },
                'thickness.end': { required: false },
                'color.start': { required: false, transform: c => normalizeColor(c) },
                'color.end': { required: false, transform: c => normalizeColor(c) }
            }
        }
    }
};

function warnUnexpectedProps(obj, expectedStructure, path = "") {
    for (let key in obj) {
        if (!expectedStructure[key]) {
            console.warn(`Unexpected property "${path}${key}" found in YAML.`);
        } else if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            warnUnexpectedProps(obj[key], expectedStructure[key], `${path}${key}.`);
        }
    }
}

function applyTransforms(obj, expectedStructure, path = "") {
    for (let key in obj) {
        if (expectedStructure?.[key]?.transform) {
            obj[key] = expectedStructure?.[key]?.transform(obj[key])
        } else if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            applyTransforms(obj[key], expectedStructure[key], `${path}${key}.`);
        }
    }
}

function errorMissingRequiredProps(obj, expectedStructure, path = "", shape) {
    if (typeof shape === 'undefined') {
        shape = obj
    }
    for (let key in expectedStructure) {
        if (typeof expectedStructure[key].required !== 'undefined') {
          let t = expectedStructure[key].required
          if (typeof t === 'function') {
            t = t(shape)
          }
          if (typeof t !== 'boolean') {
              throw new Error("Unexpected type of " + t);
          }
          if (t && typeof obj[key] === 'undefined') {
              throw new Error(`Expected required property "${path}${key}" but was not present`)
          }
        } else if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            errorMissingRequiredProps(obj[key], expectedStructure[key], `${path}${key}.`, shape);
        }
    }
}

function errorExtraneousProps(obj, expectedStructure, path = "", diagramObj) {
    if (typeof diagramObj === 'undefined') {
        diagramObj = obj
    }
    for (let key in expectedStructure) {
        if (typeof expectedStructure[key].allowed !== 'undefined' && typeof obj[key] !== 'undefined') {
          let t = expectedStructure[key].allowed
          if (typeof t === 'function') {
            t = t(diagramObj)
          }
          if (typeof t !== 'boolean') {
              throw new Error("Unexpected type of " + t);
          }
          if (!t) {
              throw new Error(`Property "${path}${key}" is not allowed for "${diagramObj.name}"`)
          }
        } else if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            errorExtraneousProps(obj[key], expectedStructure[key], `${path}${key}.`, diagramObj);
        }
    }
}

function propertyAllowed(diagramObj, propConstraints) {
    if (typeof propConstraints?.allowed === 'undefined') {
        return true
    }
    if (typeof propConstraints.allowed !== 'function') {
        console.error("Unexpected type of 'allowed' constraint - expected function but got " + typeof propConstraints.allowed, propConstraints)
        throw new Error("Unexpected config")
    }
    let res = propConstraints.allowed(diagramObj)
    if (typeof res !== 'boolean') {
        console.error("Unexpected result of 'allowed' constraint - expected boolean but got " + typeof res, propConstraints)
        throw new Error("Unexpected config")
    }
    return res;
}

function setDefaults(obj, expectedStructure, path = "", diagramObj) {
    if (typeof diagramObj === 'undefined') {
        diagramObj = obj
    }
    for (let key in expectedStructure) {
        if (typeof obj[key] === 'undefined' && expectedStructure[key].default && propertyAllowed(diagramObj, expectedStructure[key])) {
            obj[key] = expectedStructure[key].default
        } else if (typeof expectedStructure[key] === "object" && !Array.isArray(obj[key])
                && typeof expectedStructure[key].default === 'undefined'
                && typeof expectedStructure[key].required === 'undefined'
                && typeof expectedStructure[key].allowed === 'undefined') {
            if (typeof obj[key] === 'undefined') {
                obj[key] = {}
            }
            setDefaults(obj[key], expectedStructure[key], `${path}${key}.`, diagramObj);
        }
    }
}

// Load YAML button
document.getElementById("loadYAMLButton").addEventListener("click", function () {
    try {
        parseYamlAndRender(yamlText());
    } catch (error) {
        console.error("Error parsing YAML: " + error.message)
        throw error
    }
});

// Animate button
document.getElementById("animateButton").addEventListener("click", function () {
    try {
        objectsAndTransitions = parseYAML(yamlText())
        drawDiagram(objectsAndTransitions)
        animateDiagram(objectsAndTransitions);
    } catch (error) {
        console.error('Error parsing YAML: ' + error.message);
        throw error
    }
});

// Generate GIF button
document.getElementById("generateGIFButton").addEventListener("click", function () {
    createGIF(frames);
});


// Allowed properties for each preset shape type
const allowedShapeProperties = {
    rectangle: ["width", "height"],
    star: ["size"],
    cloud: ["width", "height"],
    database: ["width", "height"],
    line: ["length", "rotation", "width"],
    "line-arrow": ["length", "rotation", "width"],
    arrow: ["length", "rotation", "width"],
    cat: ["size"],
    dog: ["size"]
};

function parseYamlAndRender(yamlText) {
    try {
        setColors(yamlText);
        setCanvas(yamlText);
        objectsAndTransitions = parseYAML(yamlText)
        drawDiagram(objectsAndTransitions)
    } catch (error) {
        console.error('Error parsing YAML: ' + error.message);
        throw error
    }
}

function setColors(yamlText) {
  const doc = jsyaml.load(yamlText);
  let paletteName = (doc.color || {}).palette || defaultPalette
  currentColors = colorPalettes[paletteName];
  if (typeof currentColors == 'undefined') {
    console.log("Unsupported palette name: " + paletteName + "; Available palettes: ", colorPalettes)
    throw new Error("Unsupported palette name")
  }
  console.debug("Using color palette " + paletteName, currentColors)
}

function setCanvas(yamlText) {
    const doc = jsyaml.load(yamlText);
    let canvasConfig = (doc.canvas || {})
    width = (canvasConfig.width || 400)
    height = (canvasConfig.height || 400)
    canvas.height = height;
    canvas.width = width;
    if (typeof (canvasConfig.background || {}).color != 'undefined') {
      let normalizedColor = normalizeColor(canvasConfig.background.color);
      ctxBackground = () => {
        ctx.fillStyle = normalizedColor;
        ctx.fillRect(0, 0, width, height);
      }
    } else {
      ctxBackground = () => {}
    }
}

function validateMode(mode) {
  if (typeof mode === 'undefined') {
    throw new Error("required property 'mode' not defined")
  }
  let modeNames = [];
  for (let key in VALID_MODES) {
    let validMode = VALID_MODES[key]
    if (validMode.name == mode) {
      return validMode
    }
    modeNames.push(validMode.name)
  }
  let errMsg = "required property 'mode' must be one of " + modeNames
  console.error(errMsg)
  throw new Error(errMsg)
}

// Function to parse YAML input, apply defaults, and validate properties
function parseYAML(yamlText) {

    const doc = jsyaml.load(yamlText);
    let modeName = doc.mode;
    let mode = validateMode(modeName);
    requestFrameRate = (doc.config || {}).frameRate || 30

    return mode.parse(doc)
}

// Filter properties to remove extraneous fields based on allowed properties
function filterProperties(shape, allowedProperties) {
    return Object.keys(shape).reduce((filtered, key) => {
        if (allowedProperties.includes(key) || key === "shape" || key === "custom" || key === "outline") {
            filtered[key] = shape[key];
        }
        return filtered;
    }, {});
}

// Drawing Functions
function drawDiagram(objectsAndTransitions) {
    const {elements, transitions} = objectsAndTransitions;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctxBackground()

    elementsCopy = [];

    for (i = 0; i < elements.length; i++) {
      elementsCopy[i] = elements[i];
    }
    elementsCopy.sort((a,b) => {
        const diff = a.position.z - b.position.z;
        if (diff !== 0) return diff; // Sort by order first
        return a.defineOrder - b.defineOrder; // If order are equal, sort by defineOrder
    })

    elementsCopy.forEach(element => {
        const { outline } = element.icon || {};
        const outlineThickness = outline?.thickness ?? 1;
        const outlineColor = outline?.color || "black";

        ctx.beginPath();
        ctx.fillStyle = element.icon.color;
        ctx.lineWidth = outlineThickness;
        ctx.strokeStyle = outlineColor;

        const icon = element.icon;
        const { shape } = icon;
        switch (shape) {
            case "rectangle":
                ctx.rect(element.position.x, element.position.y, icon.width, icon.height);
                break;
            case "star":
                drawStar(ctx, element.position.x, element.position.y, icon.size);
                break;
            case "cloud":
                drawCloud(ctx, element.position.x, element.position.y, icon.width, icon.height);
                break;
            case "database":
                drawDatabase(ctx, element.position.x, element.position.y, icon.width, icon.height);
                break;
            case "line":
            case "line-arrow":
            case "arrow":
                drawLineOrArrow(ctx, element.position.x, element.position.y, icon.length, icon.rotation, shape);
                break;
            case "cat":
                drawCat(ctx, element.position.x, element.position.y, icon.size);
                break;
            case "dog":
                drawDog(ctx, element.position.x, element.position.y, icon.size);
                break;
        }

        // Fill and outline icon
        ctx.fill();
        if (outline && outlineThickness > 0) ctx.stroke();
        ctx.closePath();

        // Draw label
        if (element.label && element.label.value) {
            ctx.fillStyle = element.label.color;
            ctx.font = element.label.font;
            ctx.fillText(
                element.label.value,
                element.position.x + element.label.offsetX,
                element.position.y + element.label.offsetY
            );
        }
    });
}

function effectiveRateHigherThanDesired(startTime) {
  let elapsedTime = Date.now() - startTime
  let rateIfRenderedNow = (frames.length + 1) / (elapsedTime / 1000)
  let rateHigherThanDesired = rateIfRenderedNow > requestFrameRate
  return rateHigherThanDesired
}

// Function to animate properties during transitions
function animateDiagram(objectsAndTransitions) {

    const {elements, transitions} = objectsAndTransitions;
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    let lastTransitionEnd = 0
    transitions.forEach(tr => {
      lastTransitionEnd = Math.max(lastTransitionEnd, tr.timeEnd)
    })
    const animationDuration = lastTransitionEnd + 2000
    console.log("Animation will be " + animationDuration + "ms")

    startTime = Date.now();
    frames.length = 0; // Clear previous frames
    let lastFrameTime = 0;

    function animate() {
        while (effectiveRateHigherThanDesired(startTime)) {
          // do nothing
        }
        const elapsedTime = Date.now() - startTime;

        if (lastFrameTime == 0) {
          delay = 0;
        } else {
          delay = Date.now() - lastFrameTime
        }
        const frameDelay = delay;

        lastFrameTime = Date.now()

        elements.forEach(element => {
            const relevantTransitions = transitions.filter(t => t.name === element.name);

            relevantTransitions.forEach(transition => {
                const timeStart = transition.timeStart
                const timeEnd = transition.timeEnd
                const transitionIcon = transition.icon

                if (elapsedTime >= timeStart && elapsedTime <= timeEnd) {

                    const transitionDuration = transition.timeEnd - transition.timeStart
                    const progress = Math.min(1, (elapsedTime - transition.timeStart) / transitionDuration);

                    if (typeof transition.initialValues === 'undefined') {
                        transition.initialValues = {
                            position: {
                              x: transition.position?.['x.start'] ?? element.position.x,
                              y: transition.position?.['y.start'] ?? element.position.y,
                              z: transition.position?.['z.start'] ?? element.position.z
                            },

                            icon: {
                                color: transitionIcon?.['color.start'] ?? element.icon.color,
                                size: transitionIcon?.['size.start'] ?? element.icon.size,
                                height: transitionIcon?.['height.start'] ?? element.icon.height,
                                width: transitionIcon?.['width.start'] ?? element.icon.width,
                                outline: {
                                  thickness: transitionIcon?.outline?.['thickness.start'] ?? element.icon.outline.thickness,
                                  color: transitionIcon?.outline?.['color.start'] ?? element.icon.outline.color
                                }
                            }
                        }


                        console.log("Transition Start", structuredClone(transition), " on object", structuredClone(element))
                    }
                    const strategy = transition.strategy

                    // Handle transition of attributes
                    element.position.x = interpolate(strategy, transition.initialValues.position.x, transition.position?.['x.end'], progress);
                    element.position.y = interpolate(strategy, transition.initialValues.position.y, transition.position?.['y.end'], progress);
                    element.position.z = interpolate(strategy, transition.initialValues.position.z, transition.position?.['z.end'], progress);
                    element.icon.size = interpolate(strategy, transition.initialValues.icon.size, transitionIcon?.['size.end'], progress);
                    element.icon.height = interpolate(strategy, transition.initialValues.icon.height, transitionIcon?.['height.end'], progress);
                    element.icon.width = interpolate(strategy, transition.initialValues.icon.width, transitionIcon?.['width.end'], progress);
                    element.icon.outline.thickness = interpolate(strategy, transition.initialValues.icon.outline.thickness, transitionIcon?.outline?.['thickness.end'], progress);

                    element.icon.color = interpolateColor(strategy, transition.initialValues.icon.color, transitionIcon?.['color.end'], progress);
                    element.icon.outline.color = interpolateColor(strategy, transition.initialValues.icon.outline.color, transitionIcon?.outline?.['color.end'], progress);
                }
            });
        });

        drawDiagram(objectsAndTransitions);
        let frame = {
          img: ctx.getImageData(0, 0, canvas.width, canvas.height),
          delay: frameDelay
        }
        frames.push(frame); // Capture the frame

        if (elapsedTime < animationDuration) {
          animationId = requestAnimationFrame(animate);
        } else {
          actualFrameRate = frames.length / ((Date.now() - startTime) / 1000)
          console.log("Effective frame rate: " + actualFrameRate)
        }
    }

    animate();
}

// Color interpolation function
function interpolateColor(strategy, startColor, endColor, t) {
    if (typeof endColor === 'undefined') {
        return startColor
    }
    const startRGB = hexToRGB(startColor);
    const endRGB = hexToRGB(endColor);

    const r = Math.round(interpolate(strategy, startRGB.r, endRGB.r, t));
    const g = Math.round(interpolate(strategy, startRGB.g, endRGB.g, t));
    const b = Math.round(interpolate(strategy, startRGB.b, endRGB.b, t));

    return `rgb(${r}, ${g}, ${b})`;
}

const isStrategyFn = /^ *[a-zA-Z][a-zA-Z0-9_]* *=>/

// General interpolation function
function interpolate(strategy, startValue, endValue, progress) {
    if (typeof endValue === 'undefined') {
        return startValue
    }
    if (strategy === "linear") {
        return interpolateLinear(startValue, endValue, progress)
    } else if (strategy === "cosine") {
        return interpolateCosine(startValue, endValue, progress)
    } else if (isStrategyFn.test(strategy)) {
        return interpolateCustom(strategy, startValue, endValue, progress)
    } else {
        throw new Error("Unsupported transition strategy " + strategy);
    }
}

const isPaletteColor = /^p\d+$/
function normalizeColor(str) {
    if (isPaletteColor.test(str)) {
      let idx = Number(str.substr(1))
      let useColor = currentColors[idx]
      if (typeof useColor === 'undefined') {
        throw new Error("Cannot reference color " + idx + " as there are only " + currentColors.length + " colors and index is 0-based")
      }
      return useColor;
    }
    var ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = str;
    return ctx.fillStyle;
}

// Helper function to convert hex color to RGB
function hexToRGB(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

function interpolateLinear(startPos, endPos, progress) {
    return startPos + (endPos - startPos) * progress;
}

function interpolateCosine(startPos, endPos, progress) {
    let cosProgress = (1 - Math.cos(progress * Math.PI)) / 2
    return startPos * (1 - cosProgress) + endPos * cosProgress
}

function interpolateCustom(strategy, startPos, endPos, progress) {
    res = eval(strategy)(progress)
    return startPos + (endPos - startPos) * res;
}

// Function to generate GIF from captured frames
function createGIF(frames) {
    let delay = 1000 / actualFrameRate
    console.log("Delay between frames: " + delay)
    const gif = new GIF({
        workers: 2,
        quality: 10,
        width: canvas.width,
        height: canvas.height,
        delay: delay, // Delay between frames in ms
        workerScript: 'gif.worker.js'
    });

    console.log("Frames", frames)
    frames.forEach(frame => {
        console.log("Adding frame")
        gif.addFrame(frame.img, { delay: frame.delay }); // Add each frame to the GIF
    });

    // Finalize the GIF and trigger the finished event
    gif.on('finished', function(blob) {
        console.log("Finished gif")
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'animation.gif';
        link.click();
    });

    // Render the GIF
    gif.render();
}

function drawCat(ctx, x, y, size) {
    // Draw head
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, Math.PI * 2); // Head
    ctx.fill();

    // Draw ears
    ctx.beginPath();
    ctx.moveTo(x - size * 0.2, y - size * 0.4); // Left ear
    ctx.lineTo(x - size * 0.4, y - size * 0.6);
    ctx.lineTo(x - size * 0.1, y - size * 0.5);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + size * 0.2, y - size * 0.4); // Right ear
    ctx.lineTo(x + size * 0.4, y - size * 0.6);
    ctx.lineTo(x + size * 0.1, y - size * 0.5);
    ctx.fill();

    // Draw eyes
    ctx.beginPath();
    ctx.arc(x - size * 0.1, y - size * 0.1, size * 0.05, 0, Math.PI * 2); // Left eye
    ctx.arc(x + size * 0.1, y - size * 0.1, size * 0.05, 0, Math.PI * 2); // Right eye
    ctx.fillStyle = "black";
    ctx.fill();

    // Draw nose
    ctx.beginPath();
    ctx.moveTo(x, y); // Nose
    ctx.lineTo(x - size * 0.05, y + size * 0.05);
    ctx.lineTo(x + size * 0.05, y + size * 0.05);
    ctx.closePath();
    ctx.fillStyle = "black";
    ctx.fill();

    // Draw whiskers
    ctx.beginPath();
    ctx.moveTo(x - size * 0.15, y + size * 0.05); // Left whiskers
    ctx.lineTo(x - size * 0.3, y + size * 0.1);
    ctx.moveTo(x - size * 0.15, y + size * 0.1);
    ctx.lineTo(x - size * 0.3, y + size * 0.15);

    ctx.moveTo(x + size * 0.15, y + size * 0.05); // Right whiskers
    ctx.lineTo(x + size * 0.3, y + size * 0.1);
    ctx.moveTo(x + size * 0.15, y + size * 0.1);
    ctx.lineTo(x + size * 0.3, y + size * 0.15);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawDog(ctx, x, y, size) {
    // Draw head
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, Math.PI * 2); // Head
    ctx.fill();

    // Draw ears
    ctx.beginPath();
    ctx.ellipse(x - size * 0.3, y - size * 0.2, size * 0.15, size * 0.25, Math.PI / 6, 0, Math.PI * 2); // Left ear
    ctx.ellipse(x + size * 0.3, y - size * 0.2, size * 0.15, size * 0.25, -Math.PI / 6, 0, Math.PI * 2); // Right ear
    ctx.fillStyle = "darkbrown";
    ctx.fill();

    // Draw eyes
    ctx.beginPath();
    ctx.arc(x - size * 0.1, y - size * 0.1, size * 0.05, 0, Math.PI * 2); // Left eye
    ctx.arc(x + size * 0.1, y - size * 0.1, size * 0.05, 0, Math.PI * 2); // Right eye
    ctx.fillStyle = "black";
    ctx.fill();

    // Draw nose
    ctx.beginPath();
    ctx.arc(x, y + size * 0.1, size * 0.05, 0, Math.PI * 2); // Nose
    ctx.fillStyle = "black";
    ctx.fill();

    // Draw mouth
    ctx.beginPath();
    ctx.moveTo(x - size * 0.05, y + size * 0.15);
    ctx.lineTo(x, y + size * 0.2);
    ctx.lineTo(x + size * 0.05, y + size * 0.15);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawStar(ctx, x, y, size) {
    const spikes = 5;
    const outerRadius = size;
    const innerRadius = size / 2;
    let rotation = Math.PI / 2 * 3;
    let cx = x;
    let cy = y;
    let step = Math.PI / spikes;

    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rotation) * outerRadius, cy + Math.sin(rotation) * outerRadius);
        rotation += step;

        ctx.lineTo(cx + Math.cos(rotation) * innerRadius, cy + Math.sin(rotation) * innerRadius);
        rotation += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
}

function drawCloud(ctx, x, y, width, height) {
    ctx.arc(x, y, width / 4, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x + width / 4, y - height / 2, width / 4, Math.PI, 0);
    ctx.arc(x + width / 2, y - height / 2, width / 4, Math.PI, 0);
    ctx.arc(x + width, y, width / 4, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath();
}

function drawDatabase(ctx, x, y, width, height) {

    ctx.rect(x - width/2, y, width, height)
    ctx.fill();

    // Draw the top full ellipse (showing both front and back)
    ctx.beginPath();
    ctx.ellipse(x, y, width / 2, height / 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw middle ellipses (only front halves)
    for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(x, y + (i * height) / 4, width / 2, height / 4, 0, 0, Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    // Draw the bottom half-ellipse for the base outline
    ctx.beginPath();
    ctx.ellipse(x, y + height, width / 2, height / 4, 0, 0, Math.PI);
    ctx.fill();
    ctx.stroke();

    // Draw the vertical lines on the sides
    ctx.beginPath();
    ctx.moveTo(x - width / 2, y); // Left vertical line
    ctx.lineTo(x - width / 2, y + height);
    ctx.moveTo(x + width / 2, y); // Right vertical line
    ctx.lineTo(x + width / 2, y + height);
    ctx.stroke();
}

function drawLineOrArrow(ctx, x, y, length, rotation, type) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.PI / 180) * rotation);

    ctx.moveTo(0, 0);
    ctx.lineTo(length, 0);

    if (type === "line-arrow" || type === "arrow") {
        ctx.lineTo(length - 10, -5);
        ctx.moveTo(length, 0);
        ctx.lineTo(length - 10, 5);
    }

    ctx.restore();
}

// Default values for different shapes
const shapeDefaults = {
    rectangle: { width: 100, height: 50 },
    star: { size: 50 },
    line: { length: 100, rotation: 0, width: 5 },
    "line-arrow": { length: 100, rotation: 0, width: 5 },
    arrow: { length: 100, rotation: 0, width: 5 },
    cloud: { width: 100, height: 50 },
    database: { width: 100, height: 50 }
};

// Function to set default values for shapes
function setShapeDefaults(shape, shape) {
    switch (shape) {
        case "rectangle":
            shape.width = shape.width || 100;
            shape.height = shape.height || 50;
            break;
        case "star":
            shape.size = shape.size || 50;
            break;
        case "line":
        case "line-arrow":
        case "arrow":
            shape.length = shape.length || 100;
            shape.rotation = shape.rotation || 0;
            shape.width = shape.width || 5;
            break;
        case "cloud":
        case "database":
            shape.width = shape.width || 100;
            shape.height = shape.height || 50;
            break;
        case "cat":
        case "dog":
            shape.size = shape.size || 50;
            break;
    }
    return shape;
}

// Function to update YAML Defaults Display based on cursor position
function updateYamlDefaultsDisplay() {
    try {
        const yamlText = yamlInput.value;
        const {elements, transitions} = parseYAML(yamlText)
        const cursorPosition = yamlInput.selectionStart;
        const objectUnderCursor = getObjectUnderCursor(elements, cursorPosition);

        if (objectUnderCursor) {

            setDefaults(objectUnderCursor, EXPECTED_PROPERTIES.object, "object.");
            warnUnexpectedProps(objectUnderCursor, EXPECTED_PROPERTIES.object, "object.");
            errorMissingRequiredProps(objectUnderCursor, EXPECTED_PROPERTIES.object, "object.")
            errorExtraneousProps(objectUnderCursor, EXPECTED_PROPERTIES.object, "object.")
            if (objectUnderCursor.shape) {
                const { shape } = objectUnderCursor.icon.shape;
                if (shape && allowedShapeProperties[shape]) {
                    objectUnderCursor.shape = filterProperties(objectUnderCursor.shape, allowedShapeProperties[shape]);
                }
            }

            // Display the object with defaults in the read-only text area
            yamlDefaultsDisplay.value = jsyaml.dump(objectUnderCursor);
        } else {
            yamlDefaultsDisplay.value = "";
        }
    } catch (error) {
        yamlDefaultsDisplay.value = "Error parsing Yaml:\n" + error.message;
    }
}


// Helper function to find the object under cursor in YAML input
function getObjectUnderCursor(elements, cursorPosition) {
    const yamlLines = yamlInput.value.substring(0, cursorPosition).split('\n');
    const objectName = findObjectName(yamlLines);

    // Return the found object with that name
    return elements.find(obj => obj.name === objectName) || null;
}

// Helper function to find object name from cursor position in YAML input
function findObjectName(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].match(/^\s*-\s*name:\s*(\S+)/);
        if (match) return match[1];
    }
    return null;
}

// Event listeners for YAML input changes and cursor transitions
yamlInput.addEventListener("input", updateYamlDefaultsDisplay);
yamlInput.addEventListener("click", updateYamlDefaultsDisplay);
yamlInput.addEventListener("keyup", updateYamlDefaultsDisplay);
