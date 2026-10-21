/* Zadashi MD · matrix rain background (light, pauses when hidden) */
(function () {
    var c = document.getElementById('rain'); if (!c || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var x = c.getContext('2d'), chars = 'ZADASHI01アイウエオカキクケコ<>{}[]#$%&*=+/\\|', size = 16, cols, drops, timer;
    function fit() { c.width = innerWidth; c.height = innerHeight; cols = Math.ceil(c.width / size); drops = []; for (var i = 0; i < cols; i++) drops[i] = Math.random() * -50; }
    function draw() {
        x.fillStyle = 'rgba(1,5,3,.14)'; x.fillRect(0, 0, c.width, c.height); x.font = size + 'px monospace';
        for (var i = 0; i < cols; i++) {
            var t = chars.charAt((Math.random() * chars.length) | 0), y = drops[i] * size;
            x.fillStyle = Math.random() > .975 ? '#d9fff0' : '#00ff9c'; x.fillText(t, i * size, y);
            if (y > c.height && Math.random() > .975) drops[i] = 0; drops[i] += .55;
        }
    }
    function start() { if (!timer) timer = setInterval(draw, 55); } function stop() { clearInterval(timer); timer = null; }
    addEventListener('resize', fit); document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    fit(); start();
})();
