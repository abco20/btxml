#include <behaviortree_cpp/bt_factory.h>
#include <behaviortree_cpp/xml_parsing.h>

#include <iostream>

int main() {
  BT::BehaviorTreeFactory factory;

  // Generate TreeNodesModel XML from BT.CPP registered builtins.
  // Keep this helper minimal and avoid duplicating builtin registration logic in this repository.
  std::cout << BT::writeTreeNodesModelXML(factory, true) << std::endl;
  return 0;
}
