export type InputEventName = 'up' | 'down' | 'press' | 'doublePress';

export function bindKeyboardInput(handler: (eventName: InputEventName) => void): void {
  window.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowUp':
        handler('up');
        break;
      case 'ArrowDown':
        handler('down');
        break;
      case 'Enter':
        handler('press');
        break;
      case 'Escape':
        handler('doublePress');
        break;
    }
  });
}

export function bindTouchInput(target: HTMLElement, handler: (eventName: InputEventName) => void): void {
  let startY = 0;
  let startX = 0;
  let startTime = 0;
  let lastTapTime = 0;

  target.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.changedTouches.item(0);
      if (!touch) return;

      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
    },
    { passive: true }
  );

  target.addEventListener(
    'touchend',
    (event) => {
      const touch = event.changedTouches.item(0);
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const elapsed = Date.now() - startTime;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absY >= 40 && absY > absX) {
        handler(deltaY < 0 ? 'up' : 'down');
        return;
      }

      if (elapsed <= 500 && absX < 20 && absY < 20) {
        const now = Date.now();
        if (now - lastTapTime < 320) {
          lastTapTime = 0;
          handler('doublePress');
        } else {
          lastTapTime = now;
          window.setTimeout(() => {
            if (lastTapTime === now) {
              handler('press');
              lastTapTime = 0;
            }
          }, 340);
        }
      }
    },
    { passive: true }
  );
}
