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
