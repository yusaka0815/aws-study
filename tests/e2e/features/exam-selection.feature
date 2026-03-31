# Feature: 試験選択
# 学習者として、適切な試験を選んで学習を開始したい

Feature: 試験選択

  Background:
    Given アプリを開く

  Scenario: 試験一覧が表示される
    Then 試験一覧に SAA・CLF・AIF が含まれる

  Scenario: 全9試験が選択可能
    Then 試験カードが9枚表示される

  Scenario: DOP試験を選択して複数選択問題が始まる
    When DOP試験カードをタップする
    Then 問題画面に遷移する
    And 複数選択エリアが表示される

  Scenario: SAAを選択すると問題が始まる
    When SAA試験カードをタップする
    Then 問題画面に遷移する
    And 問題文が表示される
    And 4つ以上の選択肢が表示される

  Scenario: MLA試験を選択して問題を解ける
    When MLA試験カードをタップする
    Then 問題画面に遷移する
    And 問題文が表示される

  Scenario: 試験変更ボタンで選択画面に戻れる
    When SAA試験カードをタップする
    And 試験変更ボタンをタップする
    Then 試験選択画面が表示される

  Scenario: 次へボタンは選択前は押せない
    When SAA試験カードをタップする
    Then 次へボタンが無効になっている

  Scenario: 1問回答後に選択画面で今日の進捗が表示される
    Given SAA試験で1問回答済み
    When 試験変更ボタンをタップする
    Then 試験選択画面が表示される
    And 今日の学習状況が表示される

  Scenario: CLF試験を選択して問題を解ける
    When CLF試験カードをタップする
    Then 問題画面に遷移する
    And 問題文が表示される

  Scenario: SAP試験を選択して問題を解ける
    When SAP試験カードをタップする
    Then 問題画面に遷移する
    And 問題文が表示される

  Scenario: DVA試験を選択して問題を解ける
    When DVA試験カードをタップする
    Then 問題画面に遷移する
    And 問題文が表示される

  Scenario: AIF試験を選択して問題を解ける
    When AIF試験カードをタップする
    Then 問題画面に遷移する
    And 問題文が表示される

  Scenario: SOA試験を選択して問題を解ける
    When SOA試験カードをタップする
    Then 問題画面に遷移する
    And 問題文が表示される

  Scenario: DEA試験を選択して問題を解ける
    When DEA試験カードをタップする
    Then 問題画面に遷移する
    And 問題文が表示される

  Scenario: 試験カードにメタ情報エリアが存在する
    Then 各試験カードにメタ情報エリアが存在する
