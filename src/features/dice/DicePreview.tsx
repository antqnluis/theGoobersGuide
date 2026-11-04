export default function DicePreview({ onClose }: { onClose: () => void }) {
  return (
    <div className="dice-content">
      <div className="dice-header">
        <div>
          <p className="page-context">Gameplay tool</p>
          <h2>Dice roller</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dice roller"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p>
        Stay on your current page while you roll. The controls below show the
        intended layout.
      </p>
      <div className="dice-options" aria-label="Supported dice">
        {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((die) => (
          <span
            className={
              die === 'd20' ? 'die-option die-option-active' : 'die-option'
            }
            key={die}
          >
            {die}
          </span>
        ))}
      </div>
      <div className="dice-form-preview">
        <div>
          <span>Dice</span>
          <strong>1</strong>
        </div>
        <div>
          <span>Modifier</span>
          <strong>+4</strong>
        </div>
      </div>
      <div className="dice-result-preview">
        <span>Example result</span>
        <strong>17</strong>
        <p>d20: 13, modifier: +4</p>
      </div>
      <p className="preview-hint">
        Rolling and history are planned for Phase 5.
      </p>
    </div>
  );
}
