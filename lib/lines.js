// 线路数据：站名参考合肥轨道交通 1-7 号线（仅用于游戏，实际以官方线网图为准）
// level: 1 新手  2 进阶  3 高手

export const LINES = [
  {
    id: 1,
    name: "1号线",
    color: "#e53935",
    level: 1,
    stations: [
      "张洼", "兴华苑", "瑶海公园", "合肥火车站", "长淮", "明光路", "大东门", "包公园",
      "合工大南区", "朱岗", "秋浦河路", "葛大店", "望湖城", "合肥南站", "南站南广场",
      "骆岗", "高王", "滨湖会展中心", "紫庐", "塘西河公园", "金斗公园", "云谷路",
      "万达城", "万年埠", "丙子铺", "九联圩",
    ],
  },
  {
    id: 2,
    name: "2号线",
    color: "#1e88e5",
    level: 1,
    stations: [
      "南岗", "桂庄", "汽车西站", "振兴路", "蜀山西", "大蜀山", "天柱路", "科学大道",
      "十里庙", "西七里塘", "五里墩", "三里庵", "安农大", "三孝口", "四牌楼", "大东门",
      "三里街", "东五里井", "东七里", "漕冲", "东二十埠", "龙岗", "王岗", "三十埠",
      "三十埠东", "祥和", "桂王", "对河", "店埠河", "排头", "肥东站", "和睦湖", "马桥",
      "南沙河", "撮镇",
    ],
  },
  {
    id: 3,
    name: "3号线",
    color: "#43a047",
    level: 2,
    stations: [
      "相城路", "职教城东", "职教城", "幼儿师范", "文浍苑", "勤劳村", "新海大道", "窦桥湾",
      "方庙", "竹丝滩", "合肥火车站", "鸭林冲", "淮南路", "一里井", "海棠", "郑河",
      "四泉桥", "杏花村", "合肥西站", "南新庄", "西七里塘", "国防科技大学", "洪岗",
      "市政务中心", "合肥大剧院", "图书馆", "省博物院", "安医大二附院", "繁华大道",
      "大学城北", "工大翡翠湖校区", "安大磬苑校区", "幸福坝", "馆驿", "安医一附院南区",
      "凉亭", "李湾", "四十埠", "芮祠", "乐平", "省儿童医院新区",
    ],
  },
  {
    id: 4,
    name: "4号线",
    color: "#fb8c00",
    level: 2,
    stations: [
      "综保区", "安医大四附院", "陶冲湖东", "十里村", "新海公园", "方庙", "站塘", "东七里",
      "唐桥", "五里庙", "尧渡河路", "工经学院", "葛大店南", "望湖城南", "合肥南站", "淝南",
      "竹西", "薛河", "南屏路", "姚公庙", "天鹅湖东", "天鹅湖", "图书馆", "柳树塘", "金桂",
      "玉兰大道", "北雁湖",
    ],
  },
  {
    id: 5,
    name: "5号线",
    color: "#00897b",
    level: 3,
    stations: [
      "汲桥路", "六中菱湖校区", "菱湖公园", "北五里井", "海棠", "白水坝", "杏花公园",
      "三孝口", "稻香楼", "中国科大东区", "市第三医院", "休宁路", "凌大塘", "望湖城西",
      "合肥南站", "盛大", "包河苑", "义兴", "大连路", "花园大道", "黄河路", "扬子江路",
      "义城", "省政务中心东", "方兴湖", "渡江纪念馆", "沈湾", "华山路", "云谷路", "清水冲",
      "云川公园", "滨湖竹园", "贵阳路",
    ],
  },
  {
    id: 6,
    name: "6号线",
    color: "#8e24aa",
    level: 3,
    stations: [
      "青龙岗", "合肥七中", "量子科学中心", "科大先研院", "北雁湖", "开福寺", "梦城",
      "松荫桥", "洪岗", "陆军兵种大学", "南七里", "市第三医院", "卫岗", "朱岗", "尧渡河路",
      "唐大楼", "市儿童医院", "钢红", "大兴集", "伏龙", "龙塘",
    ],
  },
  {
    id: 7,
    name: "7号线",
    color: "#d81b60",
    level: 3,
    stations: [
      "翡翠公园", "繁华大道", "徽园", "明珠广场", "天都路", "南艳湖北", "一六八中学",
      "合肥大学", "南艳湖南", "要素大市场", "滨湖医院", "紫庐", "嵩山路", "省文化和非遗馆",
    ],
  },
];

export const LEVELS = {
  1: { label: "新手", stars: "⭐", tol: 20, vmax: 70, hint: true, limit: false },
  2: { label: "进阶", stars: "⭐⭐", tol: 15, vmax: 80, hint: true, limit: true },
  3: { label: "高手", stars: "⭐⭐⭐", tol: 10, vmax: 90, hint: false, limit: true },
};

// 某站可以换乘哪些线路（同名站出现在多条线路上即视为换乘站）
export function transfersAt(station, lineId) {
  return LINES.filter((l) => l.id !== lineId && l.stations.includes(station)).map(
    (l) => l.name
  );
}

// 由字符串生成稳定的伪随机数，保证同一段区间每次长度一样（双人对战才公平）
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// 生成一趟行程：stops 个停靠站
export function buildTrip(line, startIndex, dir, stops) {
  const lv = LEVELS[line.level];
  const names = [];
  for (let i = 0; i <= stops; i++) names.push(line.stations[startIndex + dir * i]);
  const segs = [];
  for (let i = 0; i < stops; i++) {
    const r = hash(line.id + names[i] + names[i + 1]);
    const len = Math.round(520 + r * 280); // 游戏里的站间距（米）
    let limit = null;
    if (lv.limit && hash(names[i + 1] + line.id) > 0.45) {
      const from = Math.round(len * 0.3);
      limit = { from, to: from + 130, kmh: 50 };
    }
    segs.push({ from: names[i], to: names[i + 1], len, limit, door: r > 0.5 ? "左" : "右" });
  }
  return { names, segs, terminal: dir > 0 ? line.stations[line.stations.length - 1] : line.stations[0] };
}

// 英文播报用的站名拼音（合肥轨道站名英文统一用汉语拼音，如 东七里 → Dongqili）
export const PINYIN = {
  "张洼": "Zhangwa", "兴华苑": "Xinghuayuan", "瑶海公园": "Yaohaigongyuan", "合肥火车站": "Hefeihuochezhan",
  "长淮": "Changhuai", "明光路": "Mingguanglu", "大东门": "Dadongmen", "包公园": "Baogongyuan",
  "合工大南区": "Hegongdananqu", "朱岗": "Zhugang", "秋浦河路": "Qiupuhelu", "葛大店": "Gedadian",
  "望湖城": "Wanghucheng", "合肥南站": "Hefeinanzhan", "南站南广场": "Nanzhannanguangchang", "骆岗": "Luogang",
  "高王": "Gaowang", "滨湖会展中心": "Binhuhuizhanzhongxin", "紫庐": "Zilu", "塘西河公园": "Tangxihegongyuan",
  "金斗公园": "Jindougongyuan", "云谷路": "Yungulu", "万达城": "Wandacheng", "万年埠": "Wannianbu",
  "丙子铺": "Bingzipu", "九联圩": "Jiulianwei", "南岗": "Nangang", "桂庄": "Guizhuang",
  "汽车西站": "Qichexizhan", "振兴路": "Zhenxinglu", "蜀山西": "Shushanxi", "大蜀山": "Dashushan",
  "天柱路": "Tianzhulu", "科学大道": "Kexuedadao", "十里庙": "Shilimiao", "西七里塘": "Xiqilitang",
  "五里墩": "Wulidun", "三里庵": "Sanli'an", "安农大": "Annongda", "三孝口": "Sanxiaokou",
  "四牌楼": "Sipailou", "三里街": "Sanlijie", "东五里井": "Dongwulijing", "东七里": "Dongqili",
  "漕冲": "Caochong", "东二十埠": "Dong'ershibu", "龙岗": "Longgang", "王岗": "Wanggang",
  "三十埠": "Sanshibu", "三十埠东": "Sanshibudong", "祥和": "Xianghe", "桂王": "Guiwang",
  "对河": "Duihe", "店埠河": "Dianbuhe", "排头": "Paitou", "肥东站": "Feidongzhan",
  "和睦湖": "Hemuhu", "马桥": "Maqiao", "南沙河": "Nanshahe", "撮镇": "Cuozhen",
  "相城路": "Xiangchenglu", "职教城东": "Zhijiaochengdong", "职教城": "Zhijiaocheng", "幼儿师范": "Youershifan",
  "文浍苑": "Wenhuiyuan", "勤劳村": "Qinlaocun", "新海大道": "Xinhaidadao", "窦桥湾": "Douqiaowan",
  "方庙": "Fangmiao", "竹丝滩": "Zhusitan", "鸭林冲": "Yalinchong", "淮南路": "Huainanlu",
  "一里井": "Yilijing", "海棠": "Haitang", "郑河": "Zhenghe", "四泉桥": "Siquanqiao",
  "杏花村": "Xinghuacun", "合肥西站": "Hefeixizhan", "南新庄": "Nanxinzhuang", "国防科技大学": "Guofangkejidaxue",
  "洪岗": "Honggang", "市政务中心": "Shizhengwuzhongxin", "合肥大剧院": "Hefeidajuyuan", "图书馆": "Tushuguan",
  "省博物院": "Shengbowuyuan", "安医大二附院": "Anyidaerfuyuan", "繁华大道": "Fanhuadadao", "大学城北": "Daxuechengbei",
  "工大翡翠湖校区": "Gongdafeicuihuxiaoqu", "安大磬苑校区": "Andaqingyuanxiaoqu", "幸福坝": "Xingfuba", "馆驿": "Guanyi",
  "安医一附院南区": "Anyiyifuyuannanqu", "凉亭": "Liangting", "李湾": "Liwan", "四十埠": "Sishibu",
  "芮祠": "Ruici", "乐平": "Leping", "省儿童医院新区": "Sheng'ertongyiyuanxinqu", "综保区": "Zongbaoqu",
  "安医大四附院": "Anyidasifuyuan", "陶冲湖东": "Taochonghudong", "十里村": "Shilicun", "新海公园": "Xinhaigongyuan",
  "站塘": "Zhantang", "唐桥": "Tangqiao", "五里庙": "Wulimiao", "尧渡河路": "Yaoduhelu",
  "工经学院": "Gongjingxueyuan", "葛大店南": "Gedadiannan", "望湖城南": "Wanghuchengnan", "淝南": "Feinan",
  "竹西": "Zhuxi", "薛河": "Xuehe", "南屏路": "Nanpinglu", "姚公庙": "Yaogongmiao",
  "天鹅湖东": "Tian'ehudong", "天鹅湖": "Tian'ehu", "柳树塘": "Liushutang", "金桂": "Jingui",
  "玉兰大道": "Yulandadao", "北雁湖": "Beiyanhu", "汲桥路": "Jiqiaolu", "六中菱湖校区": "Liuzhonglinghuxiaoqu",
  "菱湖公园": "Linghugongyuan", "北五里井": "Beiwulijing", "白水坝": "Baishuiba", "杏花公园": "Xinghuagongyuan",
  "稻香楼": "Daoxianglou", "中国科大东区": "Zhongguokedadongqu", "市第三医院": "Shidisanyiyuan", "休宁路": "Xiuninglu",
  "凌大塘": "Lingdatang", "望湖城西": "Wanghuchengxi", "盛大": "Shengda", "包河苑": "Baoheyuan",
  "义兴": "Yixing", "大连路": "Dalianlu", "花园大道": "Huayuandadao", "黄河路": "Huanghelu",
  "扬子江路": "Yangzijianglu", "义城": "Yicheng", "省政务中心东": "Shengzhengwuzhongxindong", "方兴湖": "Fangxinghu",
  "渡江纪念馆": "Dujiangjinianguan", "沈湾": "Shenwan", "华山路": "Huashanlu", "清水冲": "Qingshuichong",
  "云川公园": "Yunchuangongyuan", "滨湖竹园": "Binhuzhuyuan", "贵阳路": "Guiyanglu", "青龙岗": "Qinglonggang",
  "合肥七中": "Hefeiqizhong", "量子科学中心": "Liangzikexuezhongxin", "科大先研院": "Kedaxianyanyuan", "开福寺": "Kaifusi",
  "梦城": "Mengcheng", "松荫桥": "Songyinqiao", "陆军兵种大学": "Lujunbingzhongdaxue", "南七里": "Nanqili",
  "卫岗": "Weigang", "唐大楼": "Tangdalou", "市儿童医院": "Shi'ertongyiyuan", "钢红": "Ganghong",
  "大兴集": "Daxingji", "伏龙": "Fulong", "龙塘": "Longtang", "翡翠公园": "Feicuigongyuan",
  "徽园": "Huiyuan", "明珠广场": "Mingzhuguangchang", "天都路": "Tiandoulu", "南艳湖北": "Nanyanhubei",
  "一六八中学": "Yiliubazhongxue", "合肥大学": "Hefeidaxue", "南艳湖南": "Nanyanhunan", "要素大市场": "Yaosudashichang",
  "滨湖医院": "Binhuyiyuan", "嵩山路": "Songshanlu", "省文化和非遗馆": "Shengwenhuahefeiyiguan",
};
