"""Synthetic live cases for Docs routing and conflict checks."""
CASES = [
    {"id":"route_friend","message":"henry goes to harvard","records":[{"entityId":"henry0001","entityType":"friend","name":"Henry","aliases":[],"revision":1,"sections":[]}],"expected":{"action":"add","entityId":"henry0001","conflicts":[]}},
    {"id":"route_conflict","message":"henry goes to harvard","records":[{"entityId":"henry0001","entityType":"friend","name":"Henry","aliases":[],"revision":1,"sections":[{"sectionId":"section001","content":"Henry goes to Yale","createdAt":"2026-01-01"}]}],"expected":{"action":"add","entityId":"henry0001","conflicts":["section001"]}},
    {"id":"create_friend","message":"Maya likes climbing","records":[],"expected":{"action":"create","entityType":"friend","name":"Maya"}},
    {"id":"query_friend","message":"Where does Henry go to school?","records":[{"entityId":"henry0001","entityType":"friend","name":"Henry","aliases":[],"revision":1,"sections":[{"sectionId":"section001","content":"henry goes to harvard","createdAt":"2026-01-01"}]}],"expected":{"action":"query","entityId":"henry0001","answerContains":["harvard"],"sectionIds":["section001"]}},
    {"id":"clarify","message":"Kevin moved","records":[{"entityId":"kevin0001","entityType":"friend","name":"Kevin","aliases":[],"revision":1,"sections":[]},{"entityId":"kevin0002","entityType":"friend","name":"Kevin","aliases":[],"revision":1,"sections":[]}],"expected":{"action":"clarify","choiceIds":["kevin0001","kevin0002"]}},
]

if __name__ == "__main__":
    from pathlib import Path
    import sys
    sys.path.insert(0,str(Path(__file__).resolve().parent/"functions"))
    from eval_harness import main
    raise SystemExit(main(CASES))
