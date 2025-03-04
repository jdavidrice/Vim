import { Position } from 'vscode';
import { YankOperator } from '../../actions/operator';
import { RegisterMode } from '../../register/register';
import { VimState } from '../../state/vimState';
import { CommandBase, LineRange } from '../node';
import { Scanner } from '../scanner';

export interface YankCommandArguments {
  linesToYank?: number;
  register?: string;
}

export class YankCommand extends CommandBase {
  private readonly arguments: YankCommandArguments;

  constructor(args: YankCommandArguments) {
    super();
    this.arguments = args;
  }

  public static parse(args: string): YankCommand {
    if (!args || !args.trim()) {
      return new YankCommand({});
    }
    /**
     * :y[ank] [register] [cnt]
     * :y[ank] [cnt] (if the first argument is a number)
     */
    const scanner = new Scanner(args);
    const arg1 = scanner.nextWord(); // [cnt] or [register]
    const arg2 = scanner.nextWord(); // [cnt] or EOF

    let register;
    let linesToYank;

    if (isNaN(+arg1)) {
      register = arg1;
      linesToYank = isNaN(+arg2) ? undefined : +arg2;
    } else {
      linesToYank = +arg1;
    }

    return new YankCommand({
      register,
      linesToYank,
    });
  }

  private async yank(vimState: VimState, start: Position, end: Position) {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    if (this.arguments.register) {
      vimState.recordedState.registerName = this.arguments.register;
    }

    const cursorPosition = vimState.cursorStopPosition;

    await new YankOperator().run(vimState, start.getLineBegin(), end.getLineEnd());

    // YankOperator moves the cursor - undo that
    vimState.cursorStopPosition = cursorPosition;
  }

  async execute(vimState: VimState): Promise<void> {
    const linesToYank = this.arguments.linesToYank ?? 1;
    const startPosition = vimState.cursorStartPosition;
    const endPosition = linesToYank
      ? startPosition.getDown(linesToYank - 1).getLineEnd()
      : vimState.cursorStopPosition;
    await this.yank(vimState, startPosition, endPosition);
  }

  override async executeWithRange(vimState: VimState, range: LineRange): Promise<void> {
    /**
     * If a [cnt] and [range] is specified (e.g. :.+2y3), :yank [cnt] is called from
     * the end of the [range].
     * Ex. if two lines are VisualLine highlighted, :<,>y3 will :y3
     * from the end of the selected lines.
     */
    const [start, end] = range.resolve(vimState);
    if (this.arguments.linesToYank) {
      vimState.cursorStartPosition = new Position(end, 0);
      await this.execute(vimState);
      return;
    }

    await this.yank(vimState, new Position(start, 0), new Position(end, 0));
  }
}
