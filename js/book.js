/* 老叔之家象棋 内置棋谱数据(纯静态, 零依赖)
   数据结构: { id, title, description, userSide:'red'|'black',
              steps:[{ from, to, name, mover:'red'|'black', comment }] }
   坐标: sq = row*9+col, row0=黑方底线, row9=红方底线
   加载: 由 ui.js 的校验器经 XQEngine 规则引擎逐着校验, 非法谱自动剔除 */
(function (g) {
  'use strict';

  var B = [
    {
      id: 'spp-zcj-hc',
      title: '顺炮直车对横车',
      description: '经典的顺手炮开局:红方直车快速出动,黑方横车抢占肋道,是学习对攻节奏的入门名局。',
      userSide: 'red',
      steps: [
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '把右炮平到中路,直接瞄准对方中卒和帅门,这是最经典的当头炮开局。' },
        { from: 25, to: 22, name: '炮8平5', mover: 'black', comment: '黑方也用炮对中,叫做顺手炮,双方在中路较劲,开局就充满火药味。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '跳正马保护中兵,同时给右车让出通道,一着两用。' },
        { from: 7, to: 24, name: '马8进7', mover: 'black', comment: '黑方同样跳马保中卒,准备出车迎战。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '右车平到二路,立刻瞄准黑方八路炮,直车出动的速度很快。' },
        { from: 8, to: 17, name: '车9进1', mover: 'black', comment: '黑方车不急着出直,而是先进一步准备横车,这就是横车的下法。' },
        { from: 82, to: 65, name: '马八进七', mover: 'red', comment: '左马也跳正马,双马守好两翼,阵型稳稳当当。' },
        { from: 17, to: 12, name: '车9平4', mover: 'black', comment: '横车平到四路肋道,准备抢占宫心,威胁红方阵地。' },
        { from: 88, to: 34, name: '车二进六', mover: 'red', comment: '红车直接过河压到黑方阵地,给黑方制造压力,直车对横车的激战开始。' },
        { from: 29, to: 38, name: '卒3进1', mover: 'black', comment: '黑方挺起三路卒,准备活通左马,寻找反击的机会。' }
      ]
    },
    {
      id: 'zppj3-dpbm',
      title: '中炮进三兵对屏风马',
      description: '红方中炮加进三兵,黑方双马护中的屏风马,攻防有序,是中炮体系最流行的开局之一。',
      userSide: 'red',
      steps: [
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '当头炮架起,目标直指黑方中卒。' },
        { from: 7, to: 24, name: '马8进7', mover: 'black', comment: '黑方右马跳正马,先守住中卒这道防线。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '红方也跳马保中兵,顺便让出车的通道。' },
        { from: 8, to: 7, name: '车9平8', mover: 'black', comment: '黑方出直车,准备和红方在二路线上针锋相对。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '红方直车同样平出,两车即将在一条线上相遇。' },
        { from: 29, to: 38, name: '卒3进1', mover: 'black', comment: '黑方先挺三路卒,为左马开路,这叫屏风马左车右移的准备。' },
        { from: 60, to: 51, name: '兵三进一', mover: 'red', comment: '红方挺三路兵,这是进三兵开局,既活马又能限制黑马。' },
        { from: 1, to: 20, name: '马2进3', mover: 'black', comment: '黑方左马跳正马,双马护中,屏风马阵型完成,防守非常稳固。' },
        { from: 82, to: 63, name: '马八进九', mover: 'red', comment: '红方左马跳边马,避开对方卒的纠缠,准备配合边路进攻。' },
        { from: 27, to: 36, name: '卒1进1', mover: 'black', comment: '黑方挺边卒,准备用边马和边车配合反击。' }
      ]
    },
    {
      id: 'dtp-dffm',
      title: '当头炮对反宫马',
      description: '黑方用士角炮配合马防守反宫马阵型,稳中带反击,是后手应对中炮的稳健选择。',
      userSide: 'red',
      steps: [
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '当头炮开局,直指黑方中路。' },
        { from: 1, to: 20, name: '马2进3', mover: 'black', comment: '黑方先跳左马,稳住阵脚,不急着应中炮。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '红方跳马保中兵,车路通畅。' },
        { from: 25, to: 23, name: '炮8平6', mover: 'black', comment: '黑方把炮平到士角,这就是士角炮,反宫马的招牌阵型,守住肋道。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '红方右车平出,直指黑炮。' },
        { from: 7, to: 24, name: '马8进7', mover: 'black', comment: '黑方右马再跳正马,双马一炮组成反宫马,阵型灵活又有韧性。' },
        { from: 82, to: 65, name: '马八进七', mover: 'red', comment: '红方左马跳正马,双马护中,准备全面进攻。' },
        { from: 8, to: 7, name: '车9平8', mover: 'black', comment: '黑方出车保炮,子力全部活跃起来。' },
        { from: 60, to: 51, name: '兵三进一', mover: 'red', comment: '红方挺三路兵,活通马路,稳步扩大先手。' },
        { from: 0, to: 1, name: '车1平2', mover: 'black', comment: '黑方左车平出,准备在红方左翼找反击机会。' }
      ]
    },
    {
      id: 'lsp-hg',
      title: '列手炮互攻',
      description: '双方各架中炮互相对轰的列手炮,节奏快、对攻猛,是体会攻击火力的经典开局。',
      userSide: 'red',
      steps: [
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '红方架起当头炮。' },
        { from: 19, to: 22, name: '炮2平5', mover: 'black', comment: '黑方不甘示弱,也把炮架到中路,这就是列手炮,双方隔河对轰。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '红方跳马保中兵。' },
        { from: 1, to: 20, name: '马2进3', mover: 'black', comment: '黑方跳马保中卒,中路的争夺势均力敌。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '红方出车,黑方中路还有炮守着,先动员子力。' },
        { from: 0, to: 1, name: '车1平2', mover: 'black', comment: '黑方左车平出,双方都准备在侧翼发起进攻。' },
        { from: 82, to: 65, name: '马八进七', mover: 'red', comment: '红方左马跳正马,双马齐活。' },
        { from: 7, to: 24, name: '马8进7', mover: 'black', comment: '黑方双马也跳起,列手炮的对攻阵型完成。' },
        { from: 81, to: 82, name: '车九平八', mover: 'red', comment: '红方左车平出,和右车形成左右夹击的态势。' },
        { from: 1, to: 55, name: '车2进6', mover: 'black', comment: '黑车直接过河压住红方七路马,列手炮的激战就此展开。' }
      ]
    },
    {
      id: 'xrzl-dzpb',
      title: '仙人指路对卒底炮',
      description: '红方先挺七路兵试应手,黑方用卒底炮反击,双方斗智斗勇的柔性开局。',
      userSide: 'red',
      steps: [
        { from: 56, to: 47, name: '兵七进一', mover: 'red', comment: '先挺七路兵,这叫仙人指路,先试探对方的意图。' },
        { from: 19, to: 20, name: '炮2平3', mover: 'black', comment: '黑方用卒底炮瞄住红方七路马,不给红方轻松出马的机会。' },
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '红方依然架起中炮,明修栈道。' },
        { from: 7, to: 24, name: '马8进7', mover: 'black', comment: '黑方跳马护中,从容应对。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '红方跳马保中兵,阵型越来越稳。' },
        { from: 8, to: 7, name: '车9平8', mover: 'black', comment: '黑方出车,准备在二路施压。' },
        { from: 82, to: 63, name: '马八进九', mover: 'red', comment: '红方左马跳边,躲开卒底炮的锋芒,这是应对卒底炮的常见思路。' },
        { from: 33, to: 42, name: '卒7进1', mover: 'black', comment: '黑方挺七路卒,活通右马,两边都在暗中较量。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '红方出右车,局面逐渐开朗。' },
        { from: 1, to: 18, name: '马2进1', mover: 'black', comment: '黑方马跳边,同样避开红方的中路火力,准备稳步反攻。' }
      ]
    },
    {
      id: 'zpgchc-pbdx',
      title: '中炮过河车平炮兑车',
      description: '红方中炮过河车压阵,黑方平炮兑车化解,攻守转换频繁,是屏风马体系的名局套路。',
      userSide: 'red',
      steps: [
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '当头炮开局。' },
        { from: 7, to: 24, name: '马8进7', mover: 'black', comment: '黑方跳马护中。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '红方跳马保兵。' },
        { from: 8, to: 7, name: '车9平8', mover: 'black', comment: '黑方出车,守住二路要道。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '红方直车平出,两车对线。' },
        { from: 33, to: 42, name: '卒7进1', mover: 'black', comment: '黑方挺卒,准备用左马反击红车。' },
        { from: 88, to: 34, name: '车二进六', mover: 'red', comment: '红车过河压住黑方阵地,这叫过河车,攻势凶猛。' },
        { from: 1, to: 20, name: '马2进3', mover: 'black', comment: '黑方跳左马,双马护中,等待时机。' },
        { from: 56, to: 47, name: '兵七进一', mover: 'red', comment: '红方挺七路兵,活通左马,保持攻势。' },
        { from: 25, to: 26, name: '炮8平9', mover: 'black', comment: '黑方平炮准备兑车,化解红方过河车的压力,这是平炮兑车的核心招法。' },
        { from: 34, to: 33, name: '车二平三', mover: 'red', comment: '红车避开兑车,压住黑方七路马,保持对黑方的压迫。' }
      ]
    },
    {
      id: 'wqp-dpbm',
      title: '五七炮对屏风马',
      description: '红方中炮加七路炮的"五七炮"阵型,黑方屏风马严密防守,攻防兼修的开局。',
      userSide: 'red',
      steps: [
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '当头炮架起。' },
        { from: 7, to: 24, name: '马8进7', mover: 'black', comment: '黑方跳马护中。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '红方跳马保中兵。' },
        { from: 8, to: 7, name: '车9平8', mover: 'black', comment: '黑方出车。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '红方出车,双车都活了。' },
        { from: 1, to: 20, name: '马2进3', mover: 'black', comment: '黑方双马护中,屏风马成型。' },
        { from: 82, to: 63, name: '马八进九', mover: 'red', comment: '红方左马跳边,为七路炮让路。' },
        { from: 29, to: 38, name: '卒3进1', mover: 'black', comment: '黑方挺三路卒,活通左马。' },
        { from: 64, to: 65, name: '炮八平七', mover: 'red', comment: '红方七路炮瞄准黑方三路马,中炮加七炮就是"五七炮"阵型。' },
        { from: 0, to: 1, name: '车1平2', mover: 'black', comment: '黑方出车,盯住红方八路炮。' },
        { from: 81, to: 82, name: '车九平八', mover: 'red', comment: '红方左车保炮,双方在左翼展开阵地战。' }
      ]
    },
    {
      id: 'zpp-dd-tm',
      title: '中炮对单提马',
      description: '黑方只提右马的单提马阵型,防守相对薄弱,红方中炮进攻可以快速掌握主动权。',
      userSide: 'red',
      steps: [
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '当头炮开局。' },
        { from: 1, to: 20, name: '马2进3', mover: 'black', comment: '黑方先跳左马。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '红方跳马保兵。' },
        { from: 7, to: 26, name: '马8进9', mover: 'black', comment: '黑方右马只跳边马,这叫单提马,中路防守比较单薄。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '红方出车,直接瞄着黑方弱侧。' },
        { from: 8, to: 7, name: '车9平8', mover: 'black', comment: '黑方出车保炮,弥补边马的防守空缺。' },
        { from: 88, to: 52, name: '车二进四', mover: 'red', comment: '红车稳步过河,不贪快,保持阵型完整。' },
        { from: 27, to: 36, name: '卒1进1', mover: 'black', comment: '黑方挺边卒,准备边路反击。' },
        { from: 56, to: 47, name: '兵七进一', mover: 'red', comment: '红方挺七路兵,活通左马,继续稳步推进。' }
      ]
    },
    {
      id: 'fx-ryzp',
      title: '飞相局对右中炮',
      description: '红方先飞相稳守再图进攻,黑方右中炮反击,柔中带刚的经典开局。',
      userSide: 'red',
      steps: [
        { from: 87, to: 67, name: '相三进五', mover: 'red', comment: '先飞相护中,不求急攻,先把防守做得滴水不漏,这是飞相局的思路。' },
        { from: 19, to: 22, name: '炮2平5', mover: 'black', comment: '黑方架右中炮,直接在红方阵前挑战。' },
        { from: 82, to: 65, name: '马八进七', mover: 'red', comment: '红方跳马护中,应对黑方中炮。' },
        { from: 1, to: 20, name: '马2进3', mover: 'black', comment: '黑方跳马保中卒,巩固中路。' },
        { from: 81, to: 82, name: '车九平八', mover: 'red', comment: '红方出左车,准备压住黑方左翼。' },
        { from: 0, to: 1, name: '车1平2', mover: 'black', comment: '黑方出车,和红车形成对峙。' },
        { from: 56, to: 47, name: '兵七进一', mover: 'red', comment: '红方挺七路兵,活通马路,后发制人。' },
        { from: 33, to: 42, name: '卒7进1', mover: 'black', comment: '黑方挺七路卒,同样活通右马,双方稳步较量。' }
      ]
    },
    {
      id: 'pfm-zmp-h',
      title: '屏风马左马盘河(应对中炮)',
      description: '执黑研习:面对红方中炮过河车,黑方左马盘河跃出反击,是后手方最生动的反击阵型。',
      userSide: 'black',
      steps: [
        { from: 70, to: 67, name: '炮二平五', mover: 'red', comment: '红方架当头炮,目标直指黑方中路。' },
        { from: 7, to: 24, name: '马8进7', mover: 'black', comment: '黑方跳右马,守住中卒,稳住阵脚。' },
        { from: 88, to: 69, name: '马二进三', mover: 'red', comment: '红方跳马保中兵。' },
        { from: 8, to: 7, name: '车9平8', mover: 'black', comment: '黑方出车,准备对抗红方直车。' },
        { from: 89, to: 88, name: '车一平二', mover: 'red', comment: '红方出车,两车即将对线。' },
        { from: 33, to: 42, name: '卒7进1', mover: 'black', comment: '黑方挺七路卒,为左马盘河做准备。' },
        { from: 88, to: 34, name: '车二进六', mover: 'red', comment: '红车过河压来,气势汹汹。' },
        { from: 1, to: 20, name: '马2进3', mover: 'black', comment: '黑方跳左马,双马护中,屏风马阵型完成。' },
        { from: 56, to: 47, name: '兵七进一', mover: 'red', comment: '红方挺七路兵,准备活通左马继续进攻。' },
        { from: 24, to: 41, name: '马7进6', mover: 'black', comment: '黑马直接跃出河界,这叫左马盘河,勇敢地挑战红车,后手方开始反击了。' },
        { from: 34, to: 52, name: '车二退二', mover: 'red', comment: '红车只好退两步守住河口,避免被黑马围攻。' }
      ]
    }
  ];

  g.CHESS_BOOKS = B;
})(typeof window !== 'undefined' ? window : globalThis);