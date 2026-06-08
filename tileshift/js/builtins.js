// Built-in read-only layouts — always present for all users, cannot be edited
// ---------------------------------------------------------------------------

const BUILTIN_ORDER = [
  // Page 1
  'builtin_2x2',
  'builtin_3x3',
  'builtin_4x4',
  'builtin_5x5',
  'builtin_cylinder',
  // Page 2
  'builtin_staircase',
  'builtin_4x4_barriers',
  'builtin_traffic_jam',
  'builtin_loopover',
  'builtin_loopover_mini',
  // Page 3
  'builtin_domino_slide',
  'builtin_exploration',
  'builtin_islands',
  'builtin_tidying_up',
  'builtin_restricted_loopover',
  // Page 4
  'builtin_around_the_bend',
  'builtin_siamese',
  'builtin_big_tile',
  'builtin_bridge_crossings',
  'builtin_chaos',
  // Page 5
  'builtin_ouroboros',
  'builtin_sausage'
];

const BUILTIN_LAYOUTS = {

  'builtin_4x4': {
    name: '4×4', builtin: true, difficulty: 1, cols: 4, rows: 4,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'hole'}]
    ],
    rowWrap: [false,false,false,false],
    colWrap: [false,false,false,false],
    barriers: []
  },

  'builtin_5x5': {
    name: '5×5', builtin: true, difficulty: 1, cols: 5, rows: 5,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'hole'}]
    ],
    rowWrap: [false,false,false,false,false],
    colWrap: [false,false,false,false,false],
    barriers: []
  },

  'builtin_4x4_barriers': {
    name: 'barriers', builtin: true, difficulty: 2, cols: 4, rows: 4,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'hole'}]
    ],
    rowWrap: [false,false,false,false],
    colWrap: [false,false,false,false],
    barriers: ['1,3,2,3','1,0,2,0']
  },

  'builtin_siamese': {
    name: 'siamese barriers', builtin: true, difficulty: 2, cols: 7, rows: 7,
    cells: [
      [{type:'blocked'},{type:'blocked'},{type:'blocked'},{type:'active'},{type:'active'},{type:'active'},{type:'hole'}],
      [{type:'blocked'},{type:'blocked'},{type:'blocked'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'blocked'},{type:'blocked'},{type:'blocked'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'blocked'},{type:'blocked'},{type:'blocked'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'blocked'},{type:'blocked'},{type:'blocked'}],
      [{type:'hole'},{type:'active'},{type:'active'},{type:'active'},{type:'blocked'},{type:'blocked'},{type:'blocked'}]
    ],
    rowWrap: [false,false,false,false,false,false,false],
    colWrap: [false,false,false,false,false,false,false],
    barriers: ['1,3,2,3','1,6,2,6','3,1,3,2','6,1,6,2']
  },

  'builtin_big_tile': {
    // Groups: 1=[0,0-1], 2=[0,2][1,2], 3=[0,3], 4=[0,4-5], 5=[1,0], 6=[1,1],
    //         7=[1,3-4], 8=[1,5][2,5], 9=[2,0], 10=[2-3,1-2](2×2), 11=[2,3][2,4][3,4](L),
    //         12=[3,0][4,0], 13=[3,3], 14=[3,5], 15=[4,1], 16=[4,2][5,2],
    //         17=[4,3], 18=[4,4], 19=[4,5], 20=[5,0-1], 21=[5,3]
    name: 'big tile madness', builtin: true, difficulty: 3, cols: 6, rows: 6,
    cells: [
      [{type:'active',group:1}, {type:'active',group:1}, {type:'active',group:2}, {type:'active',group:3}, {type:'active',group:4}, {type:'active',group:4}],
      [{type:'active',group:5}, {type:'active',group:6}, {type:'active',group:2}, {type:'active',group:7}, {type:'active',group:7}, {type:'active',group:8}],
      [{type:'active',group:9}, {type:'active',group:10},{type:'active',group:10},{type:'active',group:11},{type:'active',group:11},{type:'active',group:8}],
      [{type:'active',group:12},{type:'active',group:10},{type:'active',group:10},{type:'active',group:13},{type:'active',group:11},{type:'active',group:14}],
      [{type:'active',group:12},{type:'active',group:15},{type:'active',group:16},{type:'active',group:17},{type:'active',group:18},{type:'active',group:19}],
      [{type:'active',group:20},{type:'active',group:20},{type:'active',group:16},{type:'active',group:21},{type:'hole'},         {type:'hole'}]
    ],
    rowWrap: [false,false,false,false,false,false],
    colWrap: [false,false,false,false,false,false],
    barriers: []
  },

  'builtin_2x2': {
    name: '2×2', builtin: true, difficulty: 0, cols: 2, rows: 2,
    cells: [
      [{type:'active',group:1},{type:'active',group:2}],
      [{type:'active',group:3},{type:'hole'}]
    ],
    rowWrap: [false,false],
    colWrap: [false,false],
    barriers: []
  },

  'builtin_3x3': {
    name: '3×3', builtin: true, difficulty: 1, cols: 3, rows: 3,
    cells: [
      [{type:'active',group:1},{type:'active',group:2},{type:'active',group:3}],
      [{type:'active',group:4},{type:'active',group:5},{type:'active',group:6}],
      [{type:'active',group:7},{type:'active',group:8},{type:'hole'}]
    ],
    rowWrap: [false,false,false],
    colWrap: [false,false,false],
    barriers: []
  },

  'builtin_staircase': {
    name: 'wrapping staircase', builtin: true, difficulty: 1, cols: 5, rows: 5,
    cells: [
      [{type:'active',group:1}, {type:'active',group:2}, {type:'active',group:3}, {type:'active',group:4}, {type:'active',group:5}],
      [{type:'active',group:6}, {type:'active',group:7}, {type:'active',group:8}, {type:'active',group:9}, {type:'active',group:10}],
      [{type:'active',group:11},{type:'active',group:12},{type:'active',group:13},{type:'active',group:14},{type:'active',group:15}],
      [{type:'active',group:16},{type:'active',group:17},{type:'active',group:18},{type:'active',group:19},{type:'active',group:20}],
      [{type:'active',group:21},{type:'active',group:22},{type:'active',group:23},{type:'active',group:24},{type:'hole'}]
    ],
    rowWrap: [false,true,true,true,true],
    colWrap: [false,false,false,false,false],
    barriers: ['0,0,1,0','1,0,1,1','1,1,2,1','2,1,2,2','2,2,3,2','3,2,3,3','3,3,4,3','4,3,4,4']
  },

  'builtin_chaos': {
    // Multi-cell tiles: 280=vertical triple (col 0, rows 0-2), 281=horizontal triple (row 0, cols 1-3),
    //                   282=L-shape ([0,5][1,5][1,6][2,5]), 284=domino ([5,3][5,4]? see row 5),
    //                   285=[5,2], 286=[6,3], 287=horizontal triple+extra ([5,4][5,5][5,6][6,5]),
    //                   288=horizontal domino ([6,0][6,1]), 290=[5,1], 291=[5,0],
    //                   292=vertical domino ([1,3][2,3])
    // Row 3 and col 3 wrap; two barriers flank col-boundary on row 3.
    name: 'chaos', builtin: true, difficulty: 3, cols: 7, rows: 7,
    cells: [
      [{type:'active',group:280},{type:'active',group:281},{type:'active',group:281},{type:'active',group:281},{type:'active'},         {type:'active',group:282},{type:'active'}        ],
      [{type:'active',group:280},{type:'active'},          {type:'active'},          {type:'active',group:292},{type:'active'},         {type:'active',group:282},{type:'active',group:282}],
      [{type:'active',group:280},{type:'active'},          {type:'active'},          {type:'active',group:292},{type:'active'},         {type:'active',group:282},{type:'active'}        ],
      [{type:'active'},          {type:'active'},          {type:'hole'},            {type:'hole'},            {type:'hole'},           {type:'active'},          {type:'active'}        ],
      [{type:'active'},          {type:'active'},          {type:'active'},          {type:'active'},          {type:'active'},         {type:'active'},          {type:'active'}        ],
      [{type:'active',group:291},{type:'active',group:290},{type:'active',group:285},{type:'active',group:284},{type:'active',group:287},{type:'active',group:287},{type:'active',group:287}],
      [{type:'active',group:288},{type:'active',group:288},{type:'active'},          {type:'active',group:286},{type:'active'},         {type:'active',group:287},{type:'active'}        ]
    ],
    rowWrap: [false,false,false,true,false,false,false],
    colWrap: [false,false,false,true,false,false,false],
    barriers: ['3,1,3,2','3,4,3,5']
  },

  'builtin_sausage': {
    // 4×6, all single-cell tiles, 1 hole bottom-left, heavy barrier network winding path.
    name: 'how the sausage is made', builtin: true, difficulty: 2, cols: 4, rows: 6,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'hole'}, {type:'active'},{type:'active'},{type:'active'}]
    ],
    rowWrap: [false,false,false,false,false,false],
    colWrap: [false,false,false,false],
    barriers: ['2,2,2,3','1,2,1,3','0,2,1,2','0,1,1,1','1,0,2,0','1,1,2,1','2,2,3,2','2,1,3,1','3,0,4,0','3,1,4,1','3,2,3,3']
  },

  'builtin_traffic_jam': {
    // Multi-cell tiles: 3=L-shape ([0,3][0,4][1,4]), 15=vertical domino ([3,3][4,3]),
    //                   17=horizontal domino ([4,0][4,1])
    name: 'traffic jam', builtin: true, difficulty: 2, cols: 5, rows: 5,
    cells: [
      [{type:'hole'},   {type:'active'},         {type:'active'},         {type:'active',group:3}, {type:'active',group:3}],
      [{type:'active'}, {type:'active'},         {type:'active'},         {type:'active'},         {type:'active',group:3}],
      [{type:'active'}, {type:'active'},         {type:'blocked'},        {type:'active'},         {type:'active'}        ],
      [{type:'active'}, {type:'active'},         {type:'active'},         {type:'active',group:15},{type:'active'}        ],
      [{type:'active',group:17},{type:'active',group:17},{type:'active'}, {type:'active',group:15},{type:'hole'}          ]
    ],
    rowWrap: [false,false,false,false,false],
    colWrap: [false,false,false,false,false],
    barriers: []
  },

  'builtin_restricted_loopover': {
    // 5×5, all single-cell, all rows wrap, only col 2 wraps vertically.
    name: 'restricted loopover', builtin: true, difficulty: 1, cols: 5, rows: 5,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}]
    ],
    rowWrap: [true,true,true,true,true],
    colWrap: [false,false,true,false,false],
    barriers: []
  },

  'builtin_cylinder': {
    // 5×5, all single-cell tiles, all rows wrap horizontally (cylinder).
    // One hole at bottom-right allows individual tile movement.
    name: '5×5 cylinder', builtin: true, difficulty: 0, cols: 5, rows: 5,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'hole'}]
    ],
    rowWrap: [true,true,true,true,true],
    colWrap: [false,false,false,false,false],
    barriers: []
  },

  'builtin_loopover_mini': {
    // 3×3, all single-cell, all rows wrap, only col 1 wraps vertically.
    name: 'restricted loopover mini', builtin: true, difficulty: 1, cols: 3, rows: 3,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'}]
    ],
    rowWrap: [true,true,true],
    colWrap: [false,true,false],
    barriers: []
  },

  'builtin_ouroboros': {
    // 3×3, 8 single-cell tiles + 1 hole, all cols wrap, 4 barriers forming a loop.
    name: 'ouroboros', builtin: true, difficulty: 2, cols: 3, rows: 3,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'hole'}]
    ],
    rowWrap: [false,false,false],
    colWrap: [true,true,true],
    barriers: ['1,0,2,0','1,1,2,1','0,1,1,1','0,2,1,2']
  },

  'builtin_loopover': {
    // 5×5, all single-cell tiles, fully wrapping in both axes (torus / loopover).
    // No holes — scrambled and solved entirely via row/column slide moves.
    name: '5×5 loopover', builtin: true, difficulty: 1, cols: 5, rows: 5,
    cells: [
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}],
      [{type:'active'},{type:'active'},{type:'active'},{type:'active'},{type:'active'}]
    ],
    rowWrap: [true,true,true,true,true],
    colWrap: [true,true,true,true,true],
    barriers: []
  },

  'builtin_domino_slide': {
    // 6×6, all 2-cell dominoes (horizontal and vertical), 2 holes top-right.
    name: 'domino slide', builtin: true, difficulty: 2, cols: 6, rows: 6,
    cells: [
      [{type:'active',group:1}, {type:'active',group:1}, {type:'active',group:2}, {type:'active',group:2}, {type:'hole'},          {type:'hole'}         ],
      [{type:'active',group:3}, {type:'active',group:4}, {type:'active',group:4}, {type:'active',group:5}, {type:'hole'},          {type:'hole'}         ],
      [{type:'active',group:3}, {type:'active',group:6}, {type:'active',group:6}, {type:'active',group:5}, {type:'active',group:7}, {type:'active',group:7}],
      [{type:'active',group:8}, {type:'active',group:8}, {type:'active',group:9}, {type:'active',group:10},{type:'active',group:11},{type:'active',group:12}],
      [{type:'active',group:13},{type:'active',group:14},{type:'active',group:9}, {type:'active',group:10},{type:'active',group:11},{type:'active',group:12}],
      [{type:'active',group:13},{type:'active',group:14},{type:'active',group:15},{type:'active',group:15},{type:'active',group:16},{type:'active',group:16}]
    ],
    rowWrap: [false,false,false,false,false,false],
    colWrap: [false,false,false,false,false,false],
    barriers: []
  },

  'builtin_tidying_up': {
    // 6×6, top row all holes, rest all 1×2 horizontal dominoes.
    name: 'tidying up', builtin: true, difficulty: 2, cols: 6, rows: 6,
    cells: [
      [{type:'hole'}, {type:'hole'}, {type:'hole'}, {type:'hole'}, {type:'hole'}, {type:'hole'}],
      [{type:'active',group:1}, {type:'active',group:1}, {type:'active',group:2}, {type:'active',group:2}, {type:'active',group:3}, {type:'active',group:3}],
      [{type:'active',group:4}, {type:'active',group:4}, {type:'active',group:5}, {type:'active',group:5}, {type:'active',group:6}, {type:'active',group:6}],
      [{type:'active',group:7}, {type:'active',group:8}, {type:'active',group:9}, {type:'active',group:10},{type:'active',group:11},{type:'active',group:12}],
      [{type:'active',group:13},{type:'active',group:14},{type:'active',group:15},{type:'active',group:16},{type:'active',group:17},{type:'active',group:18}],
      [{type:'active',group:13},{type:'active',group:14},{type:'active',group:15},{type:'active',group:16},{type:'active',group:17},{type:'active',group:18}]
    ],
    rowWrap: [false,false,false,false,false,false],
    colWrap: [false,false,false,false,false,false],
    barriers: []
  },

  'builtin_around_the_bend': {
    // 7×3, mix of 1×1 and 1×2 tiles, blocked cells forming a divider, several holes.
    name: 'around the bend', builtin: true, difficulty: 2, cols: 7, rows: 3,
    cells: [
      [{type:'active',group:1}, {type:'active',group:1}, {type:'active',group:2}, {type:'active',group:3}, {type:'active',group:4}, {type:'hole'},  {type:'active',group:5}],
      [{type:'blocked'},        {type:'blocked'},        {type:'blocked'},        {type:'active',group:6}, {type:'hole'},           {type:'hole'},  {type:'active',group:7}],
      [{type:'active',group:8}, {type:'active',group:8}, {type:'active',group:9}, {type:'active',group:10},{type:'active',group:11},{type:'hole'},  {type:'active',group:12}]
    ],
    rowWrap: [false,false,false],
    colWrap: [false,false,false,false,false,false,false],
    barriers: []
  },

  'builtin_bridge_crossings': {
    // 7×4, mix of 1×1 and 1×2 tiles, blocked cells at edges/corners, 2 barriers.
    name: 'bridge crossings', builtin: true, difficulty: 2, cols: 7, rows: 4,
    cells: [
      [{type:'active',group:1}, {type:'active',group:1}, {type:'active',group:2}, {type:'active',group:3}, {type:'active',group:4}, {type:'active',group:5}, {type:'active',group:5}],
      [{type:'active',group:6}, {type:'active',group:7}, {type:'active',group:8}, {type:'blocked'},        {type:'active',group:9}, {type:'active',group:10},{type:'active',group:11}],
      [{type:'blocked'},        {type:'hole'},           {type:'active',group:12},{type:'active',group:13},{type:'active',group:14},{type:'hole'},           {type:'blocked'}       ],
      [{type:'blocked'},        {type:'blocked'},        {type:'active',group:15},{type:'active',group:16},{type:'active',group:17},{type:'blocked'},        {type:'blocked'}       ]
    ],
    rowWrap: [false,false,false,false],
    colWrap: [false,false,false,false,false,false,false],
    barriers: ['2,2,2,3','3,3,3,4']
  },

  'builtin_exploration': {
    // 5×7, mix of 1×1 and 2-cell tiles, 1 hole bottom-right.
    name: 'exploration', builtin: true, difficulty: 2, cols: 5, rows: 7,
    cells: [
      [{type:'active',group:1}, {type:'active',group:2}, {type:'active',group:3}, {type:'active',group:4}, {type:'active',group:5}],
      [{type:'active',group:6}, {type:'active',group:7}, {type:'active',group:8}, {type:'active',group:9}, {type:'active',group:10}],
      [{type:'active',group:11},{type:'active',group:12},{type:'active',group:12},{type:'active',group:13},{type:'active',group:14}],
      [{type:'active',group:15},{type:'active',group:16},{type:'active',group:17},{type:'active',group:18},{type:'active',group:19}],
      [{type:'active',group:20},{type:'active',group:21},{type:'active',group:22},{type:'active',group:22},{type:'active',group:23}],
      [{type:'active',group:24},{type:'active',group:25},{type:'active',group:26},{type:'active',group:27},{type:'active',group:28}],
      [{type:'active',group:29},{type:'active',group:30},{type:'active',group:26},{type:'active',group:31},{type:'hole'}          ]
    ],
    rowWrap: [false,false,false,false,false,false,false],
    colWrap: [false,false,false,false,false],
    barriers: []
  },

  'builtin_islands': {
    // 6×6, large blocked region in centre, corner wrapping on rows 0&5 and cols 0&5.
    name: 'islands', builtin: true, difficulty: 2, cols: 6, rows: 6,
    cells: [
      [{type:'active',group:1}, {type:'active',group:2}, {type:'blocked'},{type:'blocked'},{type:'active',group:3}, {type:'active',group:4}],
      [{type:'active',group:1}, {type:'active',group:5}, {type:'blocked'},{type:'blocked'},{type:'active',group:6}, {type:'active',group:7}],
      [{type:'active',group:8}, {type:'hole'},           {type:'blocked'},{type:'blocked'},{type:'blocked'},        {type:'blocked'}       ],
      [{type:'blocked'},        {type:'blocked'},        {type:'blocked'},{type:'blocked'},{type:'hole'},           {type:'active',group:9}],
      [{type:'active',group:10},{type:'active',group:11},{type:'active',group:12},{type:'blocked'},{type:'active',group:13},{type:'active',group:14}],
      [{type:'active',group:15},{type:'active',group:15},{type:'active',group:16},{type:'blocked'},{type:'active',group:17},{type:'active',group:18}]
    ],
    rowWrap: [true,false,false,false,false,true],
    colWrap: [true,false,false,false,false,true],
    barriers: []
  }

};
