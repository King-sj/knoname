import { lib, game, get, _status } from "noname";

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
 * 当前是否处于自由国战对局
 *
 * @returns {boolean}
 */
function isFreeGuozhan() {
	return _status.brawl?.[PLAY_MARK] === true;
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
	lib.brawl ??= {};
	lib.brawl[PLAY_NAME] = {
		name: "自由国战",
		mode: "guozhan",
		intro: ["从国战将池中自由挑选两名武将，不限势力", "先明置的武将牌决定你的势力与性别", "牌堆与其余规则均与国战一致"],
		content: {
			[PLAY_MARK]: true,
			chooseCharacterBefore() {
				installPatches();
			},
			chooseCharacter(characterList) {
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
