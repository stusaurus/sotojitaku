import unittest, sys, urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from acquire import fetch_with_retry
class RetryTests(unittest.TestCase):
 def test_finite_429(self):
  calls=[];delays=[]
  def op(*a,**kw):
   calls.append(1);raise urllib.error.HTTPError('https://example.test',429,'limit',{'Retry-After':'999'},None)
  with self.assertRaises(urllib.error.HTTPError):fetch_with_retry(None,op,delays.append)
  self.assertEqual(len(calls),3);self.assertEqual(delays,[10,10])
 def test_finite_503(self):
  calls=[]
  def op(*a,**kw):
   calls.append(1);raise urllib.error.HTTPError('https://example.test',503,'unavailable',{},None)
  with self.assertRaises(urllib.error.HTTPError):fetch_with_retry(None,op,lambda _:None)
  self.assertEqual(len(calls),3)
 def test_no_retry_403(self):
  calls=[]
  def op(*a,**kw):
   calls.append(1);raise urllib.error.HTTPError('https://example.test',403,'forbidden',{},None)
  with self.assertRaises(urllib.error.HTTPError):fetch_with_retry(None,op,lambda _:None)
  self.assertEqual(len(calls),1)
if __name__=='__main__':unittest.main()
