import { lib, game, ui, get, _status } from "noname";

export const type = "extension";

/**
 * 玩法在 `lib.brawl` 里的注册键，同时用作扩展名
 */
const PLAY_NAME = "freeguozhan";

/**
 * 玩法标记，只有自由国战的 `_status.brawl` 带它
 */
const PLAY_MARK = "__freeguozhan";

/**
 * 包装函数上的标记，避免同一份包装叠加多层
 */
const PATCH_FLAG = "__freeguozhanPatched";

/**
 * 牌堆选项在国战模式配置里的键
 */
const PILE_CONFIG = "freeguozhan_pile";

/**
 * 牌堆选项到国战游戏模式的映射，null 表示沿用玩家自己的国战设置
 *
 * @type {Record<string, string | null>}
 */
const PILE_MODES = {
	follow: null,
	normal: "normal",
	old: "old",
	yingbian: "yingbian",
	free: "free",
};

/**
 * 本局被改写的 `guozhan_mode`，没有改写时为 null
 *
 * @type {string | null}
 */
let savedGuozhanMode = null;

/**
 * 本局可选武将，选将前记录，选将对话框据此过滤
 *
 * @type {Set<string> | null}
 */
let characterPool = null;

/**
 * 当前是否处于自由国战对局
 *
 * @returns {boolean}
 */
function isFreeGuozhan() {
	return _status.brawl?.[PLAY_MARK] === true;
}

/**
 * 把本局选的牌堆写进国战的游戏模式
 *
 * 牌堆、应变武将、翻译都交给国战自己的启动流程处理，这里只负责临时改写设置
 *
 * 调用时 `lib.config.mode` 还没切到 guozhan，两个设置都得按模式名显式读
 */
function applyPileMode() {
	const mode = PILE_MODES[get.config(PILE_CONFIG, "guozhan")] ?? null;
	const current = get.config("guozhan_mode", "guozhan");
	if (mode == null || mode === current) {
		return;
	}
	savedGuozhanMode = current;
	lib.config.mode_config.guozhan.guozhan_mode = mode;
}

/**
 * 还原被改写的游戏模式
 */
function restoreGuozhanMode() {
	if (savedGuozhanMode == null) {
		return;
	}
	lib.config.mode_config.guozhan.guozhan_mode = savedGuozhanMode;
	savedGuozhanMode = null;
}

/**
 * 包装对象上的方法
 *
 * 已经包过的原样跳过；被模式自身的补丁覆盖掉之后，下次进入对局会重新包上
 *
 * @param {object} target 方法所在的对象
 * @param {string} key 方法名
 * @param {(original: Function, self: any, args: any[]) => any} wrapper 包装逻辑
 */
function wrapMethod(target, key, wrapper) {
	const original = target[key];
	if (original?.[PATCH_FLAG]) {
		return;
	}
	const patched = function (...args) {
		return wrapper(original, this, args);
	};
	patched[PATCH_FLAG] = true;
	target[key] = patched;
}

/**
 * 自由国战的选将放行版
 *
 * 国战要求两张武将牌势力相同，这里只保留隐藏技的排除
 *
 * @param {Button} button 选将对话框里的武将按钮
 * @returns {boolean} 该按钮是否可点
 */
function filterButtonFree(button) {
	return !lib.character[button.link].hasHiddenSkill;
}

/**
 * 把国战那套"选择角色"对话框换成带搜索和筛选的自由选将框
 *
 * 将池交给本体实现过滤，搜索、武将包、势力、首字母这些筛选也就一并拿到了
 *
 * @param {GameEvent} event 选将的 chooseButton 事件
 */
function useSearchableDialog(event) {
	const pool = characterPool;
	if (!pool) {
		return;
	}
	const dialog = ui.create.characterDialog("选择角色", name => !pool.has(name), "heightset", "expandall");
	event.dialog = dialog;

	// 座位选择原本挂在被换掉的对话框上，这里补回来
	const parent = event.parent;
	if (!_status.brawl?.noAddSetting && get.config("change_identity") && typeof parent?.addSetting === "function") {
		parent.addSetting(dialog);
	}
}

/**
 * 安装本玩法需要的运行时包装
 *
 * 每一处都只在自由国战对局里生效，老国战不受影响
 */
function installPatches() {
	// 选将：国战把 filterButton 设在 chooseButton 返回的事件上，这里拦截该属性的读写
	wrapMethod(lib.element.player, "chooseButton", (original, self, args) => {
		const next = original.apply(self, args);
		if (isFreeGuozhan() && _status.event?.name === "chooseCharacter") {
			Object.defineProperty(next, "filterButton", {
				get: () => filterButtonFree,
				set: () => {},
				configurable: true,
			});
			useSearchableDialog(next);
		}
		return next;
	});

	// 势力：副将为双势力武将时，国战会回落到主将势力，这里改由副将自己决定
	wrapMethod(lib.element.player, "getGuozhanGroup", (original, self, [num = 0]) => {
		if (isFreeGuozhan() && num === 1 && !self.trueIdentity && get.is.double(self.name2)) {
			return lib.character[self.name2].group;
		}
		return original.call(self, num);
	});

	// 势力：双势力与神将的"自选势力"会抢走先明置那张的决定权，这里一律抹掉
	wrapMethod(lib.element.player, "init", (original, self, args) => {
		const result = original.apply(self, args);
		if (isFreeGuozhan() && self.trueIdentity) {
			delete self.trueIdentity;
		}
		return result;
	});

	// 性别：明置主将时国战会无条件覆盖性别，这里保持先明置那张定下的值
	wrapMethod(lib.element.player, "$showCharacter", (original, self, [num, log]) => {
		const sex = self.sex;
		const result = original.call(self, num, log);
		if (isFreeGuozhan() && sex !== "unknown" && self.sex !== sex) {
			self.sex = sex;
		}
		return result;
	});

	// AI 候选池：国战按势力成对组织候选并改写武将自身的 group，这里改成直接随机抽取
	wrapMethod(game, "getCharacterChoice", (original, self, [list, num]) => {
		if (!isFreeGuozhan()) {
			return original.call(self, list, num);
		}
		return list.splice(0, num).randomSort();
	});
}

export default async function () {
	// 牌堆：对局开始前把本局选的牌堆写进游戏模式，选将时再还原
	wrapMethod(game, "switchMode", (original, self, args) => {
		restoreGuozhanMode();
		const result = original.apply(self, args);
		if (isFreeGuozhan() && args[0] === "guozhan") {
			applyPileMode();
		}
		return result;
	});

	// 牌堆选项挂进国战模式的配置，自由国战对局里 `lib.config.mode` 就是 guozhan
	const guozhanConfig = lib.mode.guozhan?.config;
	if (guozhanConfig) {
		lib.config.mode_config.guozhan ??= {};
		guozhanConfig[PILE_CONFIG] = {
			name: "自由国战牌堆",
			init: "follow",
			item: {
				follow: "跟随国战设置",
				normal: "势备",
				old: "怀旧",
				yingbian: "应变",
				free: "自由",
			},
			frequent: true,
			intro: "仅作用于自由国战玩法，改完要重开一局自由国战才生效。势备、怀旧、应变沿用国战的对应牌堆与武将，自由则由已启用的卡牌包拼出牌堆。",
		};
	} else {
		console.error("自由国战：没有找到国战模式的配置，牌堆选项未注册");
	}

	lib.brawl ??= {};
	lib.brawl[PLAY_NAME] = {
		name: "自由国战",
		mode: "guozhan",
		intro: ["从国战将池中自由挑选两名武将，不限势力", "先明置的武将牌决定你的势力与性别", "牌堆在模式配置的“自由国战牌堆”里单独选择，其余规则与国战一致"],
		content: {
			[PLAY_MARK]: true,
			chooseCharacterBefore() {
				installPatches();
				restoreGuozhanMode();
			},
			chooseCharacter(characterList) {
				characterPool = new Set(characterList);
				return characterList;
			},
			chooseCharacterAi(player, list, back) {
				const choices = list.filter(name => lib.character[name] && !lib.character[name].hasHiddenSkill);
				if (choices.length < 2) {
					return false;
				}
				const [name1, name2] = choices.randomSort();
				player.init(name1, name2, false);
				if (back) {
					list.remove(name1);
					list.remove(name2);
					for (const name of list) {
						back.push(name);
					}
				}
				return;
			},
			chooseCharacterFixed: true,
		},
	};

	return {
		name: PLAY_NAME,
		editable: false,
	};
}
