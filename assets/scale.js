// Numbers under the plate's top degree ruler.
// The ruler ticks (drawn in CSS on .plate::after) sit 28px apart starting
// 16px in from the frame. We label every 5th tick to match.
(function () {
  var plate = document.querySelector('.plate');
  if (!plate) return;

  var scale = document.createElement('div');
  scale.className = 'plate-scale';
  plate.appendChild(scale);

  var STEP = 28;   // px between ticks — must match .plate::after
  var EVERY = 5;   // label every Nth tick

  function build() {
    var width = plate.clientWidth - 32; // left:16 + right:16 inset
    scale.textContent = '';
    var count = Math.floor(width / STEP);
    for (var i = 0; i <= count; i += EVERY) {
      var span = document.createElement('span');
      span.textContent = i;
      span.style.left = (i * STEP) + 'px';
      scale.appendChild(span);
    }
  }

  build();
  window.addEventListener('resize', build);
})();
