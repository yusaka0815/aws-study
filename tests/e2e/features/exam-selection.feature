# Feature: 試験選択
# 学習者として、適切な試験を選んで学習を開始したい

Feature: 試験選択

  Background:
    Given アプリを開く

  Scenario: 試験一覧が表示される
    Then 試験一覧に SAA・CLF・AIF が含まれる

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
