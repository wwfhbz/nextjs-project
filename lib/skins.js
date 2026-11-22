// 车身涂装：用金币兑换，开车时整列车都会换装
// body：车体从上到下的渐变色；stripe：腰带颜色（null = 用线路色）；deco：额外装饰的种类

export const SKINS = [
  { id: "standard", name: "标准涂装", price: 0, desc: "不锈钢车身 + 线路色腰带，和真车一样",
    body: ["#fbfcfd", "#e3e8ee", "#c9d0da", "#aeb6c2"], stripe: null, roof: "#9aa3b1" },
  { id: "night", name: "星空列车", price: 300, desc: "深蓝夜空，满车星星",
    body: ["#2a3a7a", "#1e2a5a", "#16204a", "#0f1736"], stripe: "#ffd54f", roof: "#141b3d", deco: "stars" },
  { id: "panda", name: "熊猫列车", price: 800, desc: "黑白熊猫配色，车头有熊猫耳朵",
    body: ["#ffffff", "#f4f4f4", "#e6e6e6", "#d6d6d6"], stripe: "#1d1d1d", roof: "#2b2b2b", deco: "panda" },
  { id: "spring", name: "新春福气号", price: 1500, desc: "中国红配金色，每节车都有“福”",
    body: ["#ef5350", "#e53935", "#c62828", "#a31515"], stripe: "#ffd54f", roof: "#8e1b1b", deco: "fu" },
  { id: "ocean", name: "海洋探险号", price: 2500, desc: "蓝色大海，小鱼跟着列车游",
    body: ["#81d4fa", "#4fc3f7", "#0288d1", "#01579b"], stripe: "#ffffff", roof: "#0d47a1", deco: "fish" },
  { id: "rainbow", name: "彩虹列车", price: 4000, desc: "七彩腰带，最闪亮的一列车",
    body: ["#ffffff", "#f7f9fc", "#e8edf5", "#d5dce8"], stripe: "rainbow", roof: "#b39ddb", deco: "rainbow" },
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}
