const sketch = function(p) {
    const BASE_URL = 'https://storage.googleapis.com/quickdraw-models/sketchRNN/models/';
    const availableModels = ['bird', 'ant', 'ambulance', 'angel', 'alarm_clock', 'antyoga', 'backpack', 'barn', 'basket', 'bear', 'bee', 'beeflower', 'bicycle', 'book', 'brain', 'bridge', 'bulldozer', 'bus', 'butterfly', 'cactus', 'calendar', 'castle', 'cat', 'catbus', 'catpig', 'chair', 'couch', 'crab', 'crabchair', 'crabrabbitfacepig', 'cruise_ship', 'diving_board', 'dog', 'dogbunny', 'dolphin', 'duck', 'elephant', 'elephantpig', 'everything', 'eye', 'face', 'fan', 'fire_hydrant', 'firetruck', 'flamingo', 'flower', 'floweryoga', 'frog', 'frogsofa', 'garden', 'hand', 'hedgeberry', 'hedgehog', 'helicopter', 'kangaroo', 'key', 'lantern', 'lighthouse', 'lion', 'lionsheep', 'lobster', 'map', 'mermaid', 'monapassport', 'monkey', 'mosquito', 'octopus', 'owl', 'paintbrush', 'palm_tree', 'parrot', 'passport', 'peas', 'penguin', 'pig', 'pigsheep', 'pineapple', 'pool', 'postcard', 'power_outlet', 'rabbit', 'rabbitturtle', 'radio', 'radioface', 'rain', 'rhinoceros', 'rifle', 'roller_coaster', 'sandwich', 'scorpion', 'sea_turtle', 'sheep', 'skull', 'snail', 'snowflake', 'speedboat', 'spider', 'squirrel', 'steak', 'stove', 'strawberry', 'swan', 'swing_set', 'the_mona_lisa', 'tiger', 'toothbrush', 'toothpaste', 'tractor', 'trombone', 'truck', 'whale', 'windmill', 'yoga', 'yogabicycle'];
    let model;
    
    // Model variables
    let modelState; 
    const temperature = 0.1; // Low temperature for precise drawing
    let modelLoaded = false;
    let modelIsActive = false;
    
    // Model pen state
    let dx, dy; 
    let x, y; 
    let startX, startY; // Track the first point of the last raw line
    let pen = [0, 0, 0]; // Model pen state, [pen_down, pen_up, pen_end]
    let previousPen = [1, 0, 0]; // Previous model pen state
    const PEN = { DOWN: 0, UP: 1, END: 2 };
    const epsilon = 2.0; // Ignore small pen movements
    
    // Human drawing variables
    let currentRawLine = [];
    let userPen = 0; // above = 0, below = 1 the paper
    let previousUserPen = 0;
    let currentColor = 'black';
    
    // Track last attempts for undo functionality
    let lastHumanStroke; // Sequence of [dx, dy, penState] strokes
    let lastHumanDrawing; // Sequence of lines drawn by the user
    let lastModelDrawing = []; // Sequence of lines drawn by the model
    
    // Flag to ignore mouse events when splash is open
    let splashIsOpen = true;
    
    /*
     * Main p5 code
     */
    p.setup = function() {
      // Initialize the canvas
      const containerSize = document.getElementById('sketch').getBoundingClientRect();
      const screenWidth = Math.floor(containerSize.width);
      const screenHeight = Math.floor(containerSize.height);
      p.createCanvas(screenWidth, screenHeight);
      p.frameRate(60);
  
      restart();
      initModel(22); // Default to Cat model
      
      // Populate model selection dropdown
      selectModels.innerHTML = availableModels.map(m => `<option>${m}</option>`).join('');
      selectModels.selectedIndex = 22; 
      selectModels.addEventListener('change', () => initModel(selectModels.selectedIndex));
      
      // Event listeners for buttons
      btnStart.addEventListener('click', () => {
        document.getElementById('splash').classList.add('hidden');
        splashIsOpen = false;
      });
      btnClear.addEventListener('click', restart);
      btnRetry.addEventListener('click', retryMagic);
      btnSave.addEventListener('click', () => {
        p.saveCanvas('magic-sketchpad', 'jpg');
      });
    };

      
    
    p.windowResized = function () {
      console.log('resize canvas');
      const containerSize = document.getElementById('sketch').getBoundingClientRect();
      const screenWidth = Math.floor(containerSize.width);
      const screenHeight = Math.floor(containerSize.height);
      p.resizeCanvas(screenWidth, screenHeight);
    };
    
    /*
     * Human drawing event handlers
     */
    p.mousePressed = function () {
      if (!splashIsOpen && p.isInBounds()) {
        x = startX = p.mouseX;
        y = startY = p.mouseY;
        userPen = 1; // Pen down
  
        modelIsActive = false;
        currentRawLine = [];
        lastHumanDrawing = [];
        previousUserPen = userPen;
        p.stroke(currentColor);
      }
    }
  
    p.mouseReleased = function () {
      if (!splashIsOpen && p.isInBounds()) {
        userPen = 0; // Pen up
        const currentRawLineSimplified = model.simplifyLine(currentRawLine);
  
        // Ignore accidental strokes
        if (currentRawLineSimplified.length > 1) {
          // Encode this line as a stroke and feed it to the model
          lastHumanStroke = model.lineToStroke(currentRawLineSimplified, [startX, startY]);
          encodeStrokes(lastHumanStroke);
        }
        currentRawLine = [];
        previousUserPen = userPen;
      }
    }
  
    p.mouseDragged = function () {
      if (!splashIsOpen && !modelIsActive && p.isInBounds()) {
        const dx0 = p.mouseX - x; 
        const dy0 = p.mouseY - y;
        if (dx0 * dx0 + dy0 * dy0 > epsilon * epsilon) { // Only if pen has moved significantly
          dx = dx0;
          dy = dy0;
          userPen = 1;
          if (previousUserPen == 1) {
            p.line(x, y, x + dx, y + dy); // Draw line connecting previous point to current point
            lastHumanDrawing.push([x, y, x + dx, y + dy]);
          }
          x += dx;
          y += dy;
          currentRawLine.push([x, y]);
        }
        previousUserPen = userPen;
      }
      return false;
    }
  
    /*
     * Model drawing function
     */
    p.draw = function() {
      if (!modelLoaded || !modelIsActive) {
        return;
      }
      
      // New state
      pen = previousPen;
      modelState = model.update([dx, dy, ...pen], modelState);
      const pdf = model.getPDF(modelState, temperature);
      [dx, dy, ...pen] = model.sample(pdf);
  
      // If the model finished drawing
      if (pen[PEN.END] === 1) {
        console.log('finished this one');
        modelIsActive = false;
      } else {
        // Draw on the canvas if the pen is down
        if (previousPen[PEN.DOWN] === 1) {
          p.line(x, y, x + dx, y + dy);
          lastModelDrawing.push([x, y, x + dx, y + dy]);
        }
        // Update coordinates
        x += dx;
        y += dy;
        previousPen = pen;
      }
    };
  
    p.isInBounds = function () {
      return p.mouseX >= 0 && p.mouseY >= 0 && p.mouseX < p.width && p.mouseY < p.height;
    }
    
    /*
     * Helper functions
     */
    function retryMagic() {
      p.stroke('white');
      p.strokeWeight(6);
      
      // Undo the previous lines drawn by the model
      for (let i = 0; i < lastModelDrawing.length; i++) {
        p.line(...lastModelDrawing[i]);
      }
      
      // Undo the previous lines drawn by the user
      for (let i = 0; i < lastHumanDrawing.length; i++) {
        p.line(...lastHumanDrawing[i]);
      }
      
      p.strokeWeight(3.0);
      p.stroke(currentColor);
      
      // Redraw the human drawing
      for (let i = 0; i < lastHumanDrawing.length; i++) {
        p.line(...lastHumanDrawing[i]);
      }
      
      // Start again
      encodeStrokes(lastHumanStroke);
    }
    
    function restart() {
      p.background(255, 255, 255, 255);
      p.strokeWeight(3.0);
  
      // Start drawing in the middle-ish of the screen
      startX = x = p.width / 2.0;
      startY = y = p.height / 3.0;
  
      // Reset the user drawing state
      userPen = 1;
      previousUserPen = 0;
      currentRawLine = [];
      strokes = [];
  
      // Reset the model drawing state
      modelIsActive = false;
      previousPen = [0, 1, 0];
    };
  
    function initModel(index) {
      modelLoaded = false;
      document.getElementById('sketch').classList.add('loading');
      
      if (model) {
        model.dispose();
      }
      
      model = new ms.SketchRNN(`${BASE_URL}${availableModels[index]}.gen.json`);
      model.initialize().then(() => {
        modelLoaded = true;
        document.getElementById('sketch').classList.remove('loading');
        console.log(`🤖 ${availableModels[index]} loaded.`);
        model.setPixelFactor(5.0); // Bigger -> large outputs
      });
    };
  
    function encodeStrokes(sequence) {
      if (sequence.length <= 5) {
        return;
      }
  
      // Encode the strokes in the model
      let newState = model.zeroState();
      newState = model.update(model.zeroInput(), newState);
      newState = model.updateStrokes(sequence, newState, sequence.length - 1);
  
      // Reset the actual model we're using to this one that has the encoded strokes
      modelState = model.copyState(newState);
      
      const lastHumanLine = lastHumanDrawing[lastHumanDrawing.length - 1];
      x = lastHumanLine[0];
      y = lastHumanLine[1];
  
      // Update the pen state
      const s = sequence[sequence.length - 1];
      dx = s[0];
      dy = s[1];
      previousPen = [s[2], s[3], s[4]];
  
      lastModelDrawing = [];
      modelIsActive = true;
    }
    
    /*
     * Colors
     */
    const COLORS = [
      { name: 'black', hex: '#000000' },
      { name: 'red', hex: '#f44336' },
      { name: 'pink', hex: '#E91E63' },
      { name: 'purple', hex: '#9C27B0' },
      { name: 'deeppurple', hex: '#673AB7' },
      { name: 'indigo', hex: '#3F51B5' },
      { name: 'blue', hex: '#2196F3' },
      { name: 'cyan', hex: '#00BCD4' },
      { name: 'teal', hex: '#009688' },
      { name: 'green', hex: '#4CAF50' },
      { name: 'lightgreen', hex: '#8BC34A' },
      { name: 'lime', hex: '#CDDC39' },
      { name: 'yellow', hex: '#FFEB3B' },
      { name: 'amber', hex: '#FFC107' },
      { name: 'orange', hex: '#FF9800' },
      { name: 'deeporange', hex: '#FF5722' },
      { name: 'brown', hex: '#795548' },
      { name: 'grey', hex: '#9E9E9E' }
    ];
    
    function randomColor() {
      return COLORS[Math.floor(Math.random() * COLORS.length)].hex;
    }
  
    function randomColorIndex() {
      return Math.floor(Math.random() * COLORS.length);
    }
  
    p.updateCurrentColor = function(index) {
      currentColor = COLORS[index].hex;
    }
    function changeColor(event){
        const btn = event.target;
        p5Sketch.updateCurrentColor(btn.dataset.index);
        document.querySelector('.active').classList.remove('active');
        btn.classList.add('active');
      }
  };
  
  // Initialize the p5 sketch
  const p5Sketch = new p5(sketch, 'sketch');
  
  function changeColor(event) {
    const btn = event.target;
    p5Sketch.updateCurrentColor(btn.dataset.index);
    document.querySelector('.active').classList.remove('active');
    btn.classList.add('active');
  }
  